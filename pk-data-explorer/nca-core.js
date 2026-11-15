/* PK Data Explorer Phase 2 — transparent NCA calculations (single dose, discrete samples). */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.PKCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PKNCA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const LN2 = Math.log(2), TOL = 1e-10;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const safe = x => finite(x) ? x : null;
  const divide = (a,b) => finite(a) && finite(b) && b !== 0 ? safe(a/b) : null;
  const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;

  function regression(points) {
    const vals = points.filter(p=>finite(p.t) && finite(p.c) && p.c>0);
    const n=vals.length;
    if(n<3) return null;
    const xbar=mean(vals.map(p=>p.t)), ybar=mean(vals.map(p=>Math.log(p.c)));
    let xx=0,xy=0,yy=0;
    vals.forEach(p=>{const dx=p.t-xbar,dy=Math.log(p.c)-ybar;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;});
    if(xx<TOL*TOL || yy<TOL*TOL) return null;
    const slope=xy/xx;
    if(!finite(slope) || slope>=0) return null;
    const intercept=ybar-slope*xbar;
    const r2=Math.min(1,Math.max(0,(xy*xy)/(xx*yy)));
    const adjR2=1-(1-r2)*(n-1)/(n-2);
    const lambda=-slope, halfLife=LN2/lambda;
    const start=vals[0].t, end=vals[n-1].t;
    return {n, start, end, times:vals.map(p=>p.t), slope, intercept, lambda, halfLife, r2, adjR2, span:(end-start)/halfLife,
      predictedLast:safe(Math.exp(intercept-lambda*end))};
  }

  // Phoenix-style Best Fit: consecutive positive terminal suffixes, >=3 points;
  // highest adjusted R², preferring longer fit when <=0.0001 apart.
  function terminalCandidates(profile,{ivBolus=false, minPoints=3, maxPoints=null, earliest=null}={}) {
    const max=profile.reduce((best,p)=>p.c>best.c?p:best,{t:Infinity,c:-Infinity});
    const candidates=profile.filter(p=>p.c>0 && (ivBolus?p.t>=max.t:p.t>max.t) && (earliest==null || p.t>=earliest));
    const outputs=[];
    for(let n=Math.max(3,minPoints);n<=candidates.length && (maxPoints==null || n<=maxPoints);n++) {
      const fit=regression(candidates.slice(-n));
      if(fit) outputs.push(fit);
    }
    return outputs;
  }
  function chooseBest(candidates) {
    if(!candidates.length)return null;
    const maximum=Math.max(...candidates.map(f=>f.adjR2));
    // Rank against the global maximum (not a drifting pairwise comparison).
    return candidates.filter(f=>maximum-f.adjR2<=1e-4+1e-12).sort((a,b)=>b.n-a.n)[0];
  }
  function manualFit(profile,times) {
    if(!times || times.length<3) return null;
    const wanted=new Set(times.map(Number));
    return regression(profile.filter(p=>wanted.has(p.t) && p.c>0));
  }

  function sampleVariance(v) {
    if(v.length<2) return null;
    const m=mean(v);return v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1);
  }
  function covarianceOfMeans(a,b) {
    const va=a.samples||[],vb=b.samples||[];
    if(!va.length || !vb.length) return 0;
    const am=new Map(),bm=new Map();
    va.forEach(p=>{if(p.animal && p.animal!=='(blank)' && !am.has(p.animal))am.set(p.animal,p.c);});
    vb.forEach(p=>{if(p.animal && p.animal!=='(blank)' && !bm.has(p.animal))bm.set(p.animal,p.c);});
    const common=[...am.keys()].filter(id=>bm.has(id));
    if(common.length<2) return 0;
    const x=common.map(id=>am.get(id)), y=common.map(id=>bm.get(id));
    const mx=mean(x),my=mean(y);
    const cov=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/(common.length-1);
    return cov*common.length/(va.length*vb.length);
  }
  function sparseAucSE(points) {
    if(points.length<2)return null;
    const weights=points.map((p,i)=>i===0?(points[1].t-p.t)/2:i===points.length-1?(p.t-points[i-1].t)/2:(points[i+1].t-points[i-1].t)/2);
    let v=0;
    for(let i=0;i<points.length;i++){
      const a=points[i], n=a.samples?.length||0;
      const vari=n>=2?sampleVariance(a.samples.map(r=>r.c))/n:0;
      v+=weights[i]*weights[i]*vari;
      for(let j=i+1;j<points.length;j++)v+=2*weights[i]*weights[j]*covarianceOfMeans(a,points[j]);
    }
    return safe(Math.sqrt(Math.max(0,v)));
  }

  function integrate(a,b,method='linear',tmax=0) {
    const dt=b.t-a.t;
    if(!(dt>0)) return {auc:0,aumc:0};
    const c0=a.c,c1=b.c;
    let useLog=false;
    if(c0>0 && c1>0 && c0!==c1) {
      if(method==='linlog') useLog=a.t>=tmax;
      if(method==='linup_logdown') useLog=c1<c0;
    }
    if(useLog) {
      const k=Math.log(c0/c1)/dt;
      if(Math.abs(k*dt)>1e-5) {
        const e=Math.exp(-k*dt);
        const auc=c0*(1-e)/k;
        const aumc=a.t*auc+c0*(1-(1+k*dt)*e)/(k*k);
        if(finite(auc)&&finite(aumc))return {auc,aumc};
      }
    }
    return {auc:dt*(c0+c1)/2, aumc:dt*(a.t*c0+b.t*c1)/2};
  }
  function integration(points,method,tmax) {
    let auc=0,aumc=0;
    for(let i=1;i<points.length;i++) {const seg=integrate(points[i-1],points[i],method,tmax);auc+=seg.auc;aumc+=seg.aumc;}
    return {auc:points.length>=2?safe(auc):null,aumc:points.length>=2?safe(aumc):null};
  }
  // All values are single-dose NCA. Systemic CL/volume require parent drug
  // measured in plasma/blood (not tissue concentration or a metabolite).
  const ROUTES = {iv_bolus:'IV bolus', extravascular:'Extravascular'};
  function routeCode(route, fallback='extravascular') {
    const v=String(route??'').trim().toLowerCase();
    if (/^(iv(?:\s+bolus)?|intravenous(?:\s+bolus)?|iv_bolus)$/.test(v)) return 'iv_bolus';
    if (/^(po|oral|sc|subcutaneous|ip|intraperitoneal|in|intranasal|im|intramuscular|extravascular)$/.test(v)) return 'extravascular';
    return fallback;
  }
  // Numeric unit conversions are explicit: convert the dose to ng and
  // concentration units to ng/mL, yielding mL/h then divide by 1000 -> L/h.
  function normalizedDoseNg(dose, doseUnit) {
    const number=C.numberOrNull(dose);
    if(number===null || number<=0)return null;
    const ratio={ 'mg/kg':1e6, 'mg':1e6, 'ug/kg':1e3, 'ug':1e3, 'ng/kg':1, 'ng':1 };
    return ratio[doseUnit]===undefined?null:number*ratio[doseUnit];
  }
  const concentrationFactor={'ng/mL':1,'ug/mL':1000,'mg/L':1000,'mg/mL':1e6};
  function parameterUnits({concUnit='ng/mL',doseUnit='mg/kg'}={}) {
    const amountPerKg=/\/kg$/.test(doseUnit);
    const volume=amountPerKg?'L/kg':'L';
    const clearance=amountPerKg?'L/h/kg':'L/h';
    const c=concUnit;
    const obj={
      Route_Model:'',Dose_Used:doseUnit,Dose_Unit:'', C0:c, C0_Method:'',
      Rsq_adjusted:'',HL_Lambda_z:'h',Span:'half-lives',Tmax:'h',Cmax:c,SE_Cmax:c,
      Tlast:'h',Clast:c,AUClast:c+'·h',SE_AUClast:c+'·h',AUCall:c+'·h',SE_AUCall:c+'·h',
      AUCINF_obs:c+'·h','AUC_%Extrap_obs':'%',AUC_BackExtrap_percent:'%',CL:clearance,Vz:volume,Vss:volume,
      Cl_F_obs:clearance,Vz_F_obs:volume, MRTlast:'h',AUMClast:c+'·h²',
      AUMCINF_obs:c+'·h²','AUMC_%Extrap_obs':'%',MRTINF_obs:'h',Lambda_z:'1/h',
      Rsq:'',No_points_lambda_z:'',Lambda_z_lower:'h',Lambda_z_upper:'h',
      Clast_pred:c,N_Samples:'timepoints',Fit_method:'',Warnings:''
    };
    return obj;
  }
  function initialConcentration(points,{routeType='extravascular',doseTime=0,ivTime0='auto',c0Method='backextrap',assumeZeroAtDose=true}={}) {
    let ordered=[...points];
    if(routeType!=='iv_bolus') {
      if(ordered[0].t>doseTime && assumeZeroAtDose)ordered.unshift({t:doseTime,c:0,samples:[],inserted:true});
      const c0=ordered[0].t===doseTime?ordered[0].c:null;
      return {points:ordered,c0,method:c0===null?'None':ordered[0].inserted?'Inserted zero':'Observed',warning:null};
    }
    // At time zero, an observed zero is usually predose. A positive value is
    // taken to be postdose in auto mode; users can explicitly override this.
    const atDose=ordered.filter(q=>Math.abs(q.t-doseTime)<=1e-10);
    const doseObs=atDose.length?atDose[0]:null;
    const isPredose=doseObs && (ivTime0==='predose' || (ivTime0==='auto' && doseObs.c<=0));
    if(isPredose)ordered=ordered.filter(q=>q!==doseObs);
    else if(doseObs)return {points:ordered,c0:doseObs.c,method:'Observed',warning:null};
    if(c0Method==='none')return {points:ordered,c0:null,method:'None',warning:'No IV bolus C0 estimated; initial exposure from dose to first sample omitted.'};
    if(!ordered.length)return {points:ordered,c0:null,method:'None',warning:'No postdose samples available for IV C0.'};
    const a=ordered[0],b=ordered[1];
    let c0=a.c,method='First postdose concentration',warning=null;
    if(c0Method==='backextrap' && b && a.c>0 && b.c>0 && b.c<a.c && b.t>a.t) {
      const k=Math.log(a.c/b.c)/(b.t-a.t);
      const computed=a.c*Math.exp(k*(a.t-doseTime));
      if(finite(computed) && computed>0){c0=computed;method='Log-linear back-extrapolation';}
      else warning='IV C0 extrapolation overflow; used first concentration.';
    } else if(c0Method==='backextrap')warning='IV C0 back-extrapolation not possible from first two declining positive points; first concentration used.';
    if(finite(c0))ordered.unshift({t:doseTime,c:c0,samples:[],inserted:true,syntheticC0:true});
    return {points:ordered,c0:finite(c0)?c0:null,method,warning};
  }
  function calcProfile(profile,opts={}) {
    const {method='linear', ivBolus=false, routeType=null, dose=null, doseUnit='mg/kg', concUnit='ng/mL',
      allowSystemic=true, manualTimes=null,minPoints=3,maxPoints=null,earliest=null,
      assumeZeroAtDose=false,doseTime=0,ivTime0='auto',c0Method='backextrap',isSparse=false}=opts;
    let points=[...profile].filter(p=>finite(p.t)&&finite(p.c)&&p.t>=doseTime).sort((a,b)=>a.t-b.t);
    if(points.length<2)return null;
    const warnings=[];
    if(points.some(p=>p.c<0))warnings.push('Negative concentration included as supplied; review interpretation.');
    const route=routeType || (ivBolus?'iv_bolus':'extravascular');
    const initial=initialConcentration(points,{routeType:route,doseTime,ivTime0,c0Method,assumeZeroAtDose});
    points=initial.points;
    if(initial.warning)warnings.push(initial.warning);
    if(points.length<2)return null;
    // Synthetic or back-extrapolated C0 is never an observed Cmax or a terminal fit point.
    const observed=points.filter(p=>!p.inserted);
    if(observed.length<2)return null;
    const max=observed.reduce((a,b)=>b.c>a.c?b:a);
    const pos=observed.filter(p=>p.c>0),last=pos.at(-1)||null;
    const tmax=max.t,cmax=max.c;
    const iLast=last?points.indexOf(last):-1;
    const lastPoints=iLast>=0?points.slice(0,iLast+1):[];
    const allAbs=integration(points,method,tmax);
    const untilAbs=lastPoints.length?integration(lastPoints,method,tmax):{auc:null,aumc:null};
    const all={auc:allAbs.auc,aumc:allAbs.aumc!==null&&allAbs.auc!==null?allAbs.aumc-doseTime*allAbs.auc:null};
    const auc=untilAbs.auc,aumc=untilAbs.aumc!==null&&auc!==null?untilAbs.aumc-doseTime*auc:null;
    const includeCmax=opts.terminalModel==='bolus' || (opts.terminalModel!=='nonbolus' && route==='iv_bolus');
    const candidates=terminalCandidates(observed,{ivBolus:includeCmax,minPoints,maxPoints,earliest});
    const auto=chooseBest(candidates),hasManual=Array.isArray(manualTimes);
    const fit=hasManual?manualFit(observed,manualTimes):auto;
    if(!fit)warnings.push(hasManual?'Manual terminal points did not yield a valid negative-slope fit.':'No eligible terminal fit with at least three positive observations and negative slope.');
    const lambda=fit?.lambda??null,halfLife=fit?.halfLife??null;
    const aucInf=fit && auc!==null && last ? auc+last.c/lambda : null;
    const aucEx=aucInf!=null && aucInf!==0 ? 100*(aucInf-auc)/aucInf : null;
    const amInf=fit && aumc!==null && last ? aumc + last.c*((last.t-doseTime)/lambda+1/(lambda*lambda)):null;
    const amEx=amInf!=null && amInf!==0 ?100*(amInf-aumc)/amInf:null;
    const mrt=divide(amInf,aucInf);
    const syntheticInitial=points.find(p=>p.syntheticC0);
    const initialSegment=syntheticInitial&&points.length>=2?integrate(points[0],points[1],method,tmax).auc:null;
    const earlyEx=initialSegment!==null&&aucInf>0?100*initialSegment/aucInf:null;
    const doseNg=normalizedDoseNg(dose,doseUnit),cFactor=concentrationFactor[concUnit];
    // Guard against tissue concentration and metabolite-derived pseudo-clearance.
    const hasSystemic=allowSystemic && cFactor!==undefined;
    const clearance=hasSystemic && doseNg!==null && aucInf>0 ? safe(doseNg/(aucInf*cFactor*1000)):null;
    const vz=clearance!==null && lambda>0 ? safe(clearance/lambda):null;
    const vss=clearance!==null && mrt!==null ? safe(clearance*mrt):null;
    if(isSparse && syntheticInitial)warnings.push('Sparse SE does not include uncertainty in extrapolated C0.');
    if(!hasSystemic && doseNg!==null)warnings.push('CL/volume not calculated: requires systemic parent plasma/blood concentrations and compatible units.');
    if(doseNg===null)warnings.push('No positive dose supplied; CL and volume unavailable.');
    if(fit && fit.adjR2<0.9)warnings.push('Adjusted R² < 0.90');
    if(fit && fit.span<2)warnings.push('Terminal span < 2 half-lives');
    if(aucEx!==null && aucEx>20)warnings.push('AUC extrapolation > 20%');
    if(fit && fit.n===3)warnings.push('Terminal fit uses only three points');
    const seCmax=isSparse && max.samples?.length>=2?Math.sqrt(sampleVariance(max.samples.map(v=>v.c))/max.samples.length):null;
    const seAuc=isSparse && method==='linear'?sparseAucSE(lastPoints):null;
    const seAucAll=isSparse && method==='linear'?sparseAucSE(points):null;
    const result={
      Route_Model:ROUTES[route]||route,Dose_Used:C.numberOrNull(dose),Dose_Unit:doseUnit,
      C0:initial.c0,C0_Method:initial.method,
      Rsq_adjusted:fit?.adjR2??null,HL_Lambda_z:halfLife,Span:fit?.span??null,Tmax:tmax-doseTime,Cmax:cmax,SE_Cmax:seCmax,
      Tlast:last?last.t-doseTime:null,Clast:last?.c??null,AUClast:auc,SE_AUClast:seAuc,AUCall:all.auc,SE_AUCall:seAucAll,
      AUCINF_obs:safe(aucInf),'AUC_%Extrap_obs':safe(aucEx),AUC_BackExtrap_percent:safe(earlyEx),
      CL:route==='iv_bolus'?clearance:null,Vz:route==='iv_bolus'?vz:null,Vss:route==='iv_bolus'?vss:null,
      Cl_F_obs:route==='extravascular'?clearance:null,Vz_F_obs:route==='extravascular'?vz:null,
      MRTlast:divide(aumc,auc),AUMClast:aumc,AUMCINF_obs:safe(amInf),
      'AUMC_%Extrap_obs':safe(amEx),MRTINF_obs:mrt,Lambda_z:lambda,Rsq:fit?.r2??null,
      No_points_lambda_z:fit?.n??0,Lambda_z_lower:fit?.start??null,Lambda_z_upper:fit?.end??null,
      Clast_pred:fit?last?Math.exp(fit.intercept-lambda*last.t):null:null,
      N_Samples:observed.length,Fit_method:hasManual?'Manual':'Best fit',Warnings:warnings.join(' | ')
    };
    return {points,fit,auto,candidates,result,warnings};
  }
  function calculate(rows,{timeCol,valueCol,animalCol='',groupCols=[],mode='sparse',routeCol='',doseCol='',...options}={}) {
    const groups=new Map();
    for(const raw of rows) {
      const t=C.numberOrNull(raw[timeCol]),c=C.numberOrNull(raw[valueCol]);
      if(t===null || c===null)continue;
      const labels=groupCols.map(col=>C.label(raw[col]));
      const animal=animalCol?C.label(raw[animalCol]):'';
      const id=JSON.stringify([...labels,...(mode==='individual'?[animal]:[])]);
      if(!groups.has(id))groups.set(id,{id,labels,animal,rows:[],route:'',dose:null});
      const grp=groups.get(id);grp.rows.push({t,c,animal,raw});
      if(routeCol && !grp.route)grp.route=C.label(raw[routeCol]);
      if(doseCol && C.numberOrNull(raw[doseCol])!==null)grp.dose=C.numberOrNull(raw[doseCol]);
    }
    const profiles=[];
    for(const group of groups.values()) {
      const times=new Map();
      for(const p of group.rows){if(!times.has(p.t))times.set(p.t,[]);times.get(p.t).push(p);}
      const curve=[...times.entries()].map(([t,samples])=>({t,c:C.summarize(samples.map(s=>s.c)).mean,samples})).sort((a,b)=>a.t-b.t);
      const override=options.dosingMap?.[group.id]||{};
      const route=routeCode(override.route??group.route,options.defaultRoute||'extravascular');
      const dose=override.dose!==undefined?C.numberOrNull(override.dose):group.dose??options.dose;
      const manualTimes=options.manualOverrides?.[group.id]??null;
      const nca=calcProfile(curve,{...options,routeType:route,dose,manualTimes,isSparse:mode==='sparse'});
      if(nca)profiles.push({...group,...nca,route,dose});
    }
    profiles.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    return profiles;
  }
  const OUTPUT_COLUMNS=['Route_Model','Dose_Used','Dose_Unit','C0','C0_Method','Rsq_adjusted','HL_Lambda_z','Span','Tmax','Cmax','SE_Cmax','Tlast','Clast','AUClast','SE_AUClast','AUCall','SE_AUCall','AUCINF_obs','AUC_%Extrap_obs','AUC_BackExtrap_percent','CL','Vz','Vss','Cl_F_obs','Vz_F_obs','MRTlast','AUMClast','AUMCINF_obs','AUMC_%Extrap_obs','MRTINF_obs','Lambda_z','Rsq','No_points_lambda_z','Lambda_z_lower','Lambda_z_upper','Clast_pred','N_Samples','Fit_method','Warnings'];
  return {regression,terminalCandidates,chooseBest,manualFit,integrate,integration,sparseAucSE,calcProfile,calculate,routeCode,parameterUnits,initialConcentration,OUTPUT_COLUMNS};
});
