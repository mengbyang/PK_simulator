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
    let best=null;
    for (const fit of candidates) {
      if(!best || fit.adjR2 > best.adjR2+1e-4 || (Math.abs(fit.adjR2-best.adjR2)<=1e-4 && fit.n>best.n)) best=fit;
    }
    return best;
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
    return {auc:dt*(c0+c1)/2, aumc:dt*((2*a.t+b.t)*c0+(a.t+2*b.t)*c1)/6};
  }
  function integration(points,method,tmax) {
    let auc=0,aumc=0;
    for(let i=1;i<points.length;i++) {const seg=integrate(points[i-1],points[i],method,tmax);auc+=seg.auc;aumc+=seg.aumc;}
    return {auc:points.length>=2?safe(auc):null,aumc:points.length>=2?safe(aumc):null};
  }
  function calcProfile(profile,opts={}) {
    const {method='linear', ivBolus=false, isSparse=false, dose=null, doseUnit='mg/kg', concUnit='ng/mL', includeDoseRatios=false,
      manualTimes=null, minPoints=3, maxPoints=null, earliest=null, assumeZeroAtDose=false, doseTime=0}=opts;
    const points=[...profile].filter(p=>finite(p.t)&&finite(p.c)&&p.t>=doseTime).sort((a,b)=>a.t-b.t);
    if(!points.length)return null;
    const warnings=[];
    if(points.some(p=>p.c<0)) warnings.push('Negative concentration was included as supplied; review its interpretation.');
    if(points[0].t>doseTime && assumeZeroAtDose && !ivBolus) points.unshift({t:doseTime,c:0,samples:[],inserted:true});
    else if(points[0].t>doseTime) warnings.push('No observation at dose time; exposure from dose to first sample is not estimated.');
    if(points.length<2)return null;
    const max=points.reduce((a,b)=>b.c>a.c?b:a);
    const pos=points.filter(p=>p.c>0);
    const last=pos.at(-1)||null;
    const tmax=max.t, cmax=max.c;
    const iLast=last?points.indexOf(last):-1;
    const lastPoints=iLast>=0?points.slice(0,iLast+1):[];
    const all=integration(points,method,tmax);
    const until=lastPoints.length?integration(lastPoints,method,tmax):{auc:null,aumc:null};
    const auc=until.auc, aumc=until.aumc;
    const candidates=terminalCandidates(points,{ivBolus,minPoints,maxPoints,earliest});
    const auto=chooseBest(candidates);
    const hasManual=Array.isArray(manualTimes);
    const fit=hasManual?manualFit(points,manualTimes):auto;
    if(!fit)warnings.push(hasManual?'Manual terminal points did not yield a valid negative-slope fit.':'No eligible terminal fit with at least three positive concentrations and negative slope.');
    const lambda=fit?.lambda??null, halfLife=fit?.halfLife??null;
    const aucInf=fit && auc!==null && last ? auc+last.c/lambda : null;
    const aucEx=aucInf!=null && aucInf!==0 ? 100*(aucInf-auc)/aucInf : null;
    const amInf=fit && aumc!==null && last ? aumc + last.c*(last.t/lambda+1/(lambda*lambda)):null;
    const amEx=amInf!=null && amInf!==0 ?100*(amInf-aumc)/amInf:null;
    const doseNum=typeof dose==='number'?dose:C.numberOrNull(dose);
    const normalizedDose=(doseUnit==='ng' || doseUnit==='ng/kg')?doseNum: doseNum==null?null:doseNum*1e6;
    const ratio=includeDoseRatios && normalizedDose!==null && normalizedDose>0 && aucInf>0 ? normalizedDose/aucInf : null;
    const vz=ratio!==null && lambda ? ratio/lambda:null;
    if(fit && fit.adjR2<0.9)warnings.push('Adjusted R² < 0.90');
    if(fit && fit.span<2)warnings.push('Terminal span < 2 half-lives');
    if(aucEx!==null && aucEx>20)warnings.push('AUC extrapolation > 20%');
    if(fit && fit.n===3)warnings.push('Terminal fit uses only three points');
    if(includeDoseRatios && concUnit!=='ng/mL') warnings.push('Tissue dose/AUC ratios are not systemic clearance or volume of distribution.');
    const seCmax=isSparse && max.samples?.length>=2?Math.sqrt(sampleVariance(max.samples.map(v=>v.c))/max.samples.length):null;
    const seAuc=isSparse && method==='linear'?sparseAucSE(lastPoints):null;
    const seAucAll=isSparse && method==='linear'?sparseAucSE(points):null;
    const result={
      Rsq_adjusted:fit?.adjR2??null, HL_Lambda_z:halfLife, Span:fit?.span??null,
      Tmax:tmax,Cmax:cmax,SE_Cmax:seCmax,
      Tlast:last?.t??null,Clast:last?.c??null,
      AUClast:auc,SE_AUClast:seAuc, AUCall:all.auc,SE_AUCall:seAucAll,
      AUCINF_obs:safe(aucInf), 'AUC_%Extrap_obs':safe(aucEx),
      Vz_F_obs:safe(vz),Cl_F_obs:safe(ratio),MRTlast:divide(aumc,auc),AUMClast:aumc,
      AUMCINF_obs:safe(amInf),'AUMC_%Extrap_obs':safe(amEx),MRTINF_obs:divide(amInf,aucInf),
      Lambda_z:lambda,Rsq:fit?.r2??null,No_points_lambda_z:fit?.n??0,
      Lambda_z_lower:fit?.start??null,Lambda_z_upper:fit?.end??null,Clast_pred:fit?last?Math.exp(fit.intercept-lambda*last.t):null:null,
      N_Samples:points.filter(p=>!p.inserted).length,Fit_method:hasManual?'Manual':'Best fit',Warnings:warnings.join(' | ')
    };
    return {points,fit,auto,candidates,result,warnings};
  }

  function calculate(rows,{timeCol,valueCol,animalCol='',groupCols=[],mode='sparse',routeCol='',doseCol='',...options}={}) {
    const groups=new Map();
    for(const raw of rows) {
      const t=C.numberOrNull(raw[timeCol]), c=C.numberOrNull(raw[valueCol]);
      if(t===null || c===null) continue;
      const labels=groupCols.map(col=>C.label(raw[col]));
      const animal=animalCol?C.label(raw[animalCol]):'';
      const id=JSON.stringify([...labels,...(mode==='individual'?[animal]:[])]);
      if(!groups.has(id))groups.set(id,{id,labels,animal,rows:[], route:'', dose:null});
      const grp=groups.get(id);
      grp.rows.push({t,c,animal,raw});
      if(routeCol)grp.route=C.label(raw[routeCol]);
      if(doseCol && C.numberOrNull(raw[doseCol])!==null)grp.dose=C.numberOrNull(raw[doseCol]);
    }
    const profiles=[];
    for(const group of groups.values()) {
      const times=new Map();
      for(const p of group.rows){if(!times.has(p.t))times.set(p.t,[]);times.get(p.t).push(p);}
      const curve=[...times.entries()].map(([t,samples])=>({t,c:mode==='sparse'?C.summarize(samples.map(s=>s.c)).mean:samples.length===1?samples[0].c:C.summarize(samples.map(s=>s.c)).mean,samples})).sort((a,b)=>a.t-b.t);
      const ivBolus=routeCol?/^(iv|intravenous)(?:\s*bolus)?$/i.test(group.route):options.ivBolus===true;
      const dose=group.dose==null?options.dose:group.dose;
      const manualTimes=options.manualOverrides?.[group.id]??null;
      const nca=calcProfile(curve,{...options,ivBolus, dose, manualTimes,isSparse:mode==='sparse'});
      if(nca)profiles.push({ ...group,...nca });
    }
    profiles.sort((a,b)=>C.sortNames([a.id,b.id])[0]===a.id?-1:1);
    return profiles;
  }
  const OUTPUT_COLUMNS=['Rsq_adjusted','HL_Lambda_z','Span','Tmax','Cmax','SE_Cmax','Tlast','Clast','AUClast','SE_AUClast','AUCall','SE_AUCall','AUCINF_obs','AUC_%Extrap_obs','Vz_F_obs','Cl_F_obs','MRTlast','AUMClast','AUMCINF_obs','AUMC_%Extrap_obs','MRTINF_obs','Lambda_z','Rsq','No_points_lambda_z','Lambda_z_lower','Lambda_z_upper','Clast_pred','N_Samples','Fit_method','Warnings'];
  return {regression,terminalCandidates,chooseBest,manualFit,integrate,integration,sparseAucSE,calcProfile,calculate,OUTPUT_COLUMNS};
});