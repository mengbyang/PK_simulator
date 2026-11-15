/* Phase 2 NCA interface. Uses the phase 1 in-browser input; no server calls. */
(() => {
  'use strict';
  const C=window.PKCore, N=window.PKNCA, $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const settings={ mode:'sparse',method:'linear',routeCol:'',doseCol:'',dose:null,doseUnit:'mg/kg',concUnit:'ng/mL',
    defaultRoute:'extravascular',allowSystemic:true,ivTime0:'auto',c0Method:'backextrap',timeCol:'',
    assumeZeroAtDose:true,minPoints:3,maxPoints:null,earliest:null,doseTime:0,terminalModel:'infer' };
  let results=[], manualOverrides={}, loadedKey='', reviewedId='', configKey='',dosingMap={},dosingMapKey='';
  const selectedParameters=new Set(N.OUTPUT_COLUMNS);
  const outputColumns=()=>N.OUTPUT_COLUMNS.filter(k=>selectedParameters.has(k));
  const units=()=>N.parameterUnits(settings);
  const labelled=k=>k+(units()[k]?' ['+units()[k]+']':'');
  function refreshParameterTable() {
    $('nca-parameter-count').textContent=`${selectedParameters.size} / ${N.OUTPUT_COLUMNS.length} parameters`;
    $('nca-parameter-picks').querySelectorAll('input[data-nca-param]').forEach(x=>{x.checked=selectedParameters.has(x.value);});
    $('nca-export-csv').disabled=$('nca-export-excel').disabled=!selectedParameters.size;
    const snap=get();if(snap?.headers?.length&&results.length)buildTable(snap,colsForGrouping(snap));
  }
  function initializeParameters() {
    $('nca-parameter-picks').innerHTML=N.OUTPUT_COLUMNS.map(k=>`<label class="check-chip"><input type="checkbox" data-nca-param value="${escape(k)}" checked>${escape(k)}</label>`).join('');
    $('nca-parameter-picks').addEventListener('change',e=>{
      if(!e.target.matches('[data-nca-param]'))return;
      if(e.target.checked)selectedParameters.add(e.target.value);else selectedParameters.delete(e.target.value);
      refreshParameterTable();
    });
    $('nca-select-all').addEventListener('click',()=>{N.OUTPUT_COLUMNS.forEach(k=>selectedParameters.add(k));refreshParameterTable();});
    $('nca-select-none').addEventListener('click',()=>{selectedParameters.clear();refreshParameterTable();});
    refreshParameterTable();
  }
  const get=()=>window.PKExplorerBridge?.getSnapshot?.();
  const msg=(t,bad=false)=>{if($('nca-note')){$('nca-note').textContent=t;$('nca-note').className=bad?'status error':'status';}};
  const opt=(values,selected,blank=true)=> (blank?'<option value="">(none)</option>':'') + values.map(h=>`<option value="${escape(h)}" ${h===selected?'selected':''}>${escape(h)}</option>`).join('');
  const colsForGrouping=s=>{
    // Never pool distinct doses in sparse or individual analyses.
    const cols=s.statGroups.filter(col=>col!==s.time&&col!==settings.timeCol&&col!==s.conc&&col!==s.animal);
    if(settings.doseCol && s.headers.includes(settings.doseCol) && !cols.includes(settings.doseCol))cols.push(settings.doseCol);
    return cols;
  };
  const valFmt=(x,s)=> x===null||x===undefined?'NA':typeof x==='string'?x:C.formatNumber(x,s.sig,s.notation);
  const dataKey=s=>[s.datasetVersion,s.sheet,s.time,s.conc,s.animal,s.filename].join(' | ');
  const fileStem=s=>(s.filename||'pk-data').replace(/\.(csv|txt|xlsx|xls)$/i,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);

  function initialize() {
    const s=get(); if(!s?.headers?.length)return;
    const key=dataKey(s);
    if(key!==loadedKey){
      loadedKey=key;manualOverrides={};reviewedId='';dosingMap={};dosingMapKey='';
      settings.routeCol=s.headers.find(h=>/^(route|dose[_ ]?route|group|treatment[_ ]?group)$/i.test(h))||'';
      settings.timeCol=s.headers.find(h=>/^(sample[_ ]?time|actual[_ ]?time).*\(?h\)?/i.test(h))||s.time;
      $('nca-time-col').innerHTML=opt(s.headers,settings.timeCol,false);
      $('nca-time-col').value=settings.timeCol;
      settings.doseCol=s.headers.find(h=>/^dose(?:\s*\(|[_ ]|$)/i.test(h))||'';
      const header=(settings.doseCol||'').toLowerCase();
      settings.doseUnit=/\bmg\s*\/\s*kg/.test(header)?'mg/kg':/\bng\s*\/\s*kg/.test(header)?'ng/kg':'mg/kg';
      settings.concUnit=/ng\s*\/\s*g/i.test(s.conc)?'ng/g':/ug\s*\/\s*m[lL]/i.test(s.conc)?'ug/mL':'ng/mL';
      $('nca-route-col').innerHTML=opt(s.headers,settings.routeCol);
      $('nca-dose-col').innerHTML=opt(s.headers,settings.doseCol);
      $('nca-unit').value=settings.concUnit;
      $('nca-dose-unit').value=settings.doseUnit;
      $('nca-dose').value='';
      $('nca-systemic').checked=/\/mL$|mg\/L$/.test(settings.concUnit);
    }
    $('nca-grouping').textContent=colsForGrouping(s).join(' → ')||'(all selected records)';
  }
  function readSettings() {
    settings.mode=$('nca-mode').value;
    settings.timeCol=$('nca-time-col').value;
    settings.method=$('nca-method').value;
    settings.routeCol=$('nca-route-col').value;
    settings.doseCol=$('nca-dose-col').value;
    settings.dose=C.numberOrNull($('nca-dose').value);
    settings.doseUnit=$('nca-dose-unit').value;
    settings.concUnit=$('nca-unit').value;
    settings.defaultRoute=$('nca-default-route').value;
    settings.allowSystemic=$('nca-systemic').checked;
    settings.ivTime0=$('nca-iv-time-zero').value;
    settings.c0Method=$('nca-c0-method').value;
    settings.assumeZeroAtDose=$('nca-insertzero').checked;
    settings.minPoints=Math.max(3,Math.round(Number($('nca-minpoints').value)||3));
    settings.maxPoints=C.numberOrNull($('nca-maxpoints').value);
    settings.earliest=C.numberOrNull($('nca-earliest').value);
    settings.doseTime=C.numberOrNull($('nca-dose-time').value)??0;
    settings.terminalModel=$('nca-terminal-model').value;
  }
  function compute() {
    const s=get();if(!s?.selected?.length)return;
    initialize();readSettings();
    const groups=colsForGrouping(s);
    const profileKey=JSON.stringify([dataKey(s),settings.mode,settings.timeCol,groups,settings.routeCol,settings.doseCol]);
    if(dosingMapKey!==profileKey){dosingMap={};manualOverrides={};reviewedId='';dosingMapKey=profileKey;}
    try {
      results=N.calculate(s.selected,{...settings,timeCol:settings.timeCol,valueCol:s.conc,animalCol:s.animal,groupCols:groups,manualOverrides,dosingMap});
      buildDosingTable(s);
      $('nca-count').textContent=`${results.length} NCA profiles · ${settings.mode==='sparse'?'sparse mean profiles':'individual animal profiles'} · ${groups.join(' / ')||'all groups'}`;
      buildTable(s,groups);buildReview(s);msg('');
    } catch(e) {console.error(e);msg('NCA calculation failed: '+e.message,true);}
  }
  function buildDosingTable(s) {
    $('nca-dose-rows').innerHTML=results.map(p=>{
      const name=[...p.labels,...(settings.mode==='individual'?[p.animal]:[])].join(' / ')||'All';
      return `<tr><td>${escape(name)}</td><td><input type="number" step="any" min="0" data-profile-dose="${escape(p.id)}" value="${p.dose??''}" aria-label="Dose for ${escape(name)}"></td>`+
        `<td><select data-profile-route="${escape(p.id)}" aria-label="Route for ${escape(name)}"><option value="iv_bolus" ${p.route==='iv_bolus'?'selected':''}>IV bolus</option><option value="extravascular" ${p.route==='extravascular'?'selected':''}>Extravascular</option></select></td></tr>`;
    }).join('');
    $('nca-dose-help').textContent=`${results.length} NCA profiles; doses are in ${settings.doseUnit}. Values originate from the dose column or the manual fallback. Edit per profile as needed. Treatment routes are taken from the route column when recognizable, otherwise the default route. Changes recalculate results.`;
  }
  function buildTable(s,groups) {
    const visible=outputColumns();
    if(!visible.length){$('nca-summary').innerHTML='<tbody><tr><td>Select one or more NCA parameters.</td></tr></tbody>';return;}
    const cols=[...groups,...(settings.mode==='individual'?[s.animal||'Animal ID']:[]),...visible.map(labelled)];
    let html='<thead><tr>'+cols.map(col=>`<th title="${escape(col)}">${escape(col)}</th>`).join('')+'</tr></thead><tbody>';
    for(const p of results){
      html+='<tr>'+[...p.labels,...(settings.mode==='individual'?[p.animal]:[]),...visible.map(col=>p.result[col])].map(v=>`<td>${escape(valFmt(v,s))}</td>`).join('')+'</tr>';
    }
    $('nca-summary').innerHTML=html+'</tbody>';
  }
  function buildReview(s) {
    if(!results.length){$('nca-review').hidden=true;$('nca-review-empty').hidden=false;$('nca-review-empty').textContent='No usable profiles: check the time and concentration column mapping and NCA grouping.';return;}
    $('nca-review').hidden=false;$('nca-review-empty').hidden=true;
    if(!results.some(p=>p.id===reviewedId))reviewedId=results[0].id;
    $('nca-profile').innerHTML=results.map(p=>`<option value="${escape(p.id)}" ${p.id===reviewedId?'selected':''}>${escape(p.labels.join(' / ')||'All')}${p.animal?' / '+escape(p.animal):''}</option>`).join('');
    showProfile(s);
  }
  function showProfile(s) {
    const p=results.find(p=>p.id===reviewedId);if(!p)return;
    const fit=p.fit, auto=p.auto;
    $('nca-c0-status').textContent=`Route: ${p.result.Route_Model} · Dose: ${p.result.Dose_Used??'NA'} ${settings.doseUnit} · C₀: ${valFmt(p.result.C0,s)} ${settings.concUnit} (${p.result.C0_Method})`;
    $('nca-fit-status').textContent=(fit?`${p.result.Fit_method} · λz ${fit.lambda.toPrecision(4)} 1/h · t½ ${fit.halfLife.toPrecision(4)} h · adjusted R² ${fit.adjR2.toFixed(4)} · span ${fit.span.toFixed(2)}`:'Terminal regression not estimable')+(p.warnings.length?' | '+p.warnings.join(' | '):'');
    const candidates=p.candidates;
    let candidateHTML='<thead><tr><th>Choose</th><th>Points</th><th>Start</th><th>End</th><th>λz</th><th>Adj R²</th><th>Half-life</th><th>Span</th></tr></thead><tbody>';
    candidates.forEach((f,i)=>{
      candidateHTML+=`<tr><td><button type="button" class="button small ${fit?.times.join(',')===f.times.join(',')?'primary':'secondary'}" data-nca-candidate="${i}">${fit?.times.join(',')===f.times.join(',')?'Selected':'Use'}</button></td>`+
        [f.n,f.start,f.end,f.lambda,f.adjR2,f.halfLife,f.span].map(v=>`<td>${escape(valFmt(v,s))}</td>`).join('')+'</tr>';
    });
    $('nca-candidates').innerHTML=candidateHTML+'</tbody>';
    const fittedTimes=new Set(fit?.times||[]);
    $('nca-manual-points').innerHTML=p.points.filter(x=>x.c>0).map(x=>`<label class="check-chip"><input type="checkbox" data-nca-time="${x.t}" ${fittedTimes.has(x.t)?'checked':''}>${escape(C.formatNumber(x.t,6,'decimal'))} h</label>`).join('');
    plotDiagnostic(p,s);
  }
  function plotDiagnostic(p,s) {
    if(!window.Plotly)return;
    const x=p.points.map(q=>q.t),y=p.points.map(q=>q.c>0?q.c:null);
    const traces=[{type:'scatter',mode:'lines+markers',name:'Observed / mean',x,y,connectgaps:false,marker:{size:7,color:'#28758a'},line:{color:'#28758a',width:1.6,shape:'linear'}}];
    const initial=p.points.find(q=>q.syntheticC0);
    if(initial)traces.push({type:'scatter',mode:'markers',name:'Back-extrapolated C₀',x:[initial.t],y:[initial.c],marker:{size:12,color:'#9650a5',symbol:'star'}});
    if(p.fit){
      const fitPoints=p.points.filter(q=>p.fit.times.includes(q.t)&&q.c>0);
      traces.push({type:'scatter',mode:'markers',name:'Terminal points',x:fitPoints.map(q=>q.t),y:fitPoints.map(q=>q.c),marker:{size:11,color:'#cf6e3f',symbol:'diamond',line:{color:'white',width:1}}});
      const lo=p.fit.start,hi=p.fit.end;
      traces.push({type:'scatter',mode:'lines',name:'Terminal regression',x:[lo,hi],y:[Math.exp(p.fit.intercept-p.fit.lambda*lo),Math.exp(p.fit.intercept-p.fit.lambda*hi)],line:{color:'#cf6e3f',width:2,dash:'dash',shape:'linear'}});
    }
    const layout={height:335,margin:{l:65,r:16,t:17,b:58},paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Arial,sans-serif',size:11,color:'#385260'},
      xaxis:{title:{text:settings.timeCol||s.time},zeroline:false,showline:true,linecolor:'#aabcc1'},yaxis:{title:{text:settings.concUnit},type:'log',zeroline:false,showline:true,linecolor:'#aabcc1'},
      legend:{orientation:'h',y:-.26,x:0}};
    Plotly.react('nca-chart',traces,layout,{displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']});
  }
  function selectManual(times) {const s=get();manualOverrides[reviewedId]=times;compute();}
  function toCSV(matrix,suffix) {const s=get();const b=new Blob(['\uFEFF',C.toCSV(matrix)],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=fileStem(s)+'_'+suffix+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
  function exportRows(s) {
    const groups=colsForGrouping(s),visible=outputColumns(),head=[...groups,...(settings.mode==='individual'?[s.animal||'Animal ID']:[]),...visible.map(labelled)];
    const rows=results.map(p=>[...p.labels,...(settings.mode==='individual'?[p.animal]:[]),...visible.map(k=>p.result[k]??'NA')]);
    const diagHead=[...groups,...(settings.mode==='individual'?[s.animal||'Animal ID']:[]),'Selected','N_points','Start','End','Lambda_z','Half_life','R2','Adjusted_R2','Span','Times'];
    const diag=results.flatMap(p=>p.candidates.map(q=>[...p.labels,...(settings.mode==='individual'?[p.animal]:[]),p.fit?.times.join(',')===q.times.join(',')?'Yes':'No',q.n,q.start,q.end,q.lambda,q.halfLife,q.r2,q.adjR2,q.span,q.times.join('; ')]));
    const concHead=[...groups,...(settings.mode==='individual'?[s.animal||'Animal ID']:[]),'Time','Concentration','n','SE_mean','Included_in_terminal'];
    const conc=results.flatMap(p=>p.points.filter(q=>!q.inserted).map(q=>[...p.labels,...(settings.mode==='individual'?[p.animal]:[]),q.t,q.c,q.samples?.length||0,q.samples?.length>=2?Math.sqrt(C.summarize(q.samples.map(v=>v.c)).sd**2/q.samples.length):'NA',p.fit?.times.includes(q.t)?'Yes':'No']));
    const doseTable=[['Profile','Route','Dose','Dose unit','Concentration unit','C0 method'],...results.map(p=>[[...p.labels,...(settings.mode==='individual'?[p.animal]:[])].join(' / '),p.result.Route_Model,p.result.Dose_Used,settings.doseUnit,settings.concUnit,p.result.C0_Method])];
    const unitTable=[['Parameter','Unit'],...visible.map(k=>[k,units()[k]||'dimensionless or text'])];
    return {summary:[head,...rows],units:unitTable,doses:doseTable,diagnostics:[diagHead,...diag],profile:[concHead,...conc],settings:[['Setting','Value'],['Input file',s.filename],['Time column (NCA)',settings.timeCol],['Concentration column',s.conc],['Analysis type',settings.mode],['Curve grouping',groups.join(' / ')],['AUC method',settings.method],['Terminal candidate model',settings.terminalModel],['Automatic terminal fit','Positive suffix windows, >= minimum points, highest adjusted R2; longer window within 0.0001'],['Min terminal points',settings.minPoints],['Max terminal points',settings.maxPoints??'None'],['Earliest fit time',settings.earliest??'None'],['Dose time',settings.doseTime],['Route column',settings.routeCol],['Dose column',settings.doseCol],['Manual dose',settings.dose??'None'],['Dose units',settings.doseUnit],['Concentration units',settings.concUnit],['Systemic parent plasma/blood',settings.allowSystemic],['Default route',settings.defaultRoute],['IV time 0 convention',settings.ivTime0],['IV C0 method',settings.c0Method],['Initial zero for extravascular',settings.assumeZeroAtDose],['Important limitation','Dose/AUC ratios from tissue or metabolite data do not establish systemic clearance or distribution volume'],['Interpretation','Terminal phase must be reviewed; flags are advisory'],['Numeric missing values','Excluded'],['Zero input','Included in means and AUC; excluded from ln terminal regression']]};
  }
  function downloadExcel() {
    const s=get();if(!window.XLSX){msg('Excel library unavailable; use CSV instead.',true);return;}
    const tab=exportRows(s),book=XLSX.utils.book_new();
    for(const [k,matrix] of Object.entries(tab)){
      const ws=XLSX.utils.aoa_to_sheet(matrix);ws['!cols']=matrix[0].map((x,i)=>({wch:Math.min(34,Math.max(14,String(x).length+2))}));
      if(k==='summary'){
        const groupingCols=colsForGrouping(s).length+(settings.mode==='individual'?1:0);
        for(let r=1;r<matrix.length;r++)for(let c=groupingCols;c<matrix[r].length;c++){
          const value=matrix[r][c];if(typeof value!=='number'||!Number.isFinite(value))continue;
          const field=outputColumns()[c-groupingCols],address=XLSX.utils.encode_cell({r,c});
          if(field==='N_Samples'||field==='No_points_lambda_z'){ws[address].z='0';continue;}
          const formatted=C.formatNumber(value,s.sig,s.notation);
          const decimal=formatted.includes('.')&&!/E/i.test(formatted)?formatted.split('.')[1].length:0;
          ws[address].z=s.notation==='scientific'?'0.'+'0'.repeat(Math.max(0,s.sig-1))+'E+00':decimal?'0.'+'0'.repeat(decimal):'0';
        }
      }
      XLSX.utils.book_append_sheet(book,ws,{summary:'NCA Results',units:'Parameter Units',doses:'Dose and Route',diagnostics:'Terminal Candidates',profile:'Mean or Individual Data',settings:'Analysis Settings'}[k]);
    }
    XLSX.writeFile(book,fileStem(s)+'_NCA.xlsx',{compression:true});
  }
  async function exportPlot(fmt) {
    const s=get();if(!window.Plotly)return;
    try{await Plotly.downloadImage($('nca-chart'),{format:fmt,filename:fileStem(s)+'_terminal_fit',width:900,height:520,scale:fmt==='png'?2:1});}
    catch(e){msg('Unable to export plot: '+e.message,true);}
  }
  initializeParameters();
  $('nca-dose-rows').addEventListener('change',e=>{
    const doseInput=e.target.closest('[data-profile-dose]');
    const routeInput=e.target.closest('[data-profile-route]');
    if(!doseInput&&!routeInput)return;
    const id=doseInput?.dataset.profileDose??routeInput?.dataset.profileRoute;
    const profile=results.find(p=>p.id===id);
    if(!profile)return;
    const existing=dosingMap[id]||{dose:profile.dose,route:profile.route};
    if(doseInput)existing.dose=C.numberOrNull(doseInput.value);
    if(routeInput)existing.route=routeInput.value;
    dosingMap[id]=existing;compute();
  });
  // Settings live-update; manual overrides persist until source or grouping changes.
  document.querySelectorAll('#nca-pane input,#nca-pane select').forEach(input=>{
    if(input.id==='nca-profile' || input.matches('[data-nca-param]'))return;
    input.addEventListener('change',()=>{
      const s=get(), newKey=JSON.stringify(colsForGrouping(s));
      if(configKey && configKey!==newKey)manualOverrides={};
      configKey=newKey;
      compute();
    });
  });
  $('nca-profile').addEventListener('change',e=>{reviewedId=e.target.value;showProfile(get());});
  $('nca-candidates').addEventListener('click',e=>{const btn=e.target.closest('button[data-nca-candidate]');if(!btn)return;const p=results.find(x=>x.id===reviewedId),fit=p?.candidates[Number(btn.dataset.ncaCandidate)];if(fit)selectManual(fit.times);});
  $('nca-manual-apply').addEventListener('click',()=>{
    const times=[...document.querySelectorAll('#nca-manual-points input:checked')].map(e=>Number(e.dataset.ncaTime));
    if(times.length<3){msg('Select at least three positive concentration points.',true);return;}
    const p=results.find(x=>x.id===reviewedId),fit=N.manualFit(p.points,times);
    if(!fit){msg('Selected points do not produce a valid negative-slope regression.',true);return;}
    selectManual(times);
  });
  $('nca-auto-reset').addEventListener('click',()=>{delete manualOverrides[reviewedId];compute();});
  $('nca-export-csv').addEventListener('click',()=>{const snap=get(), table=exportRows(snap).summary; const nGroup=colsForGrouping(snap).length+(settings.mode==='individual'?1:0); const cols=outputColumns(); const formatted=table.map((row,i)=>i===0?row:row.map((v,j)=>j<nGroup||['No_points_lambda_z','N_Samples'].includes(cols[j-nGroup])?v:typeof v==='number'?C.formatNumber(v,snap.sig,snap.notation):v)); toCSV(formatted,'NCA_summary');});
  $('nca-export-excel').addEventListener('click',downloadExcel);
  $('nca-export-diagnostics').addEventListener('click',()=>toCSV(exportRows(get()).diagnostics,'terminal_candidates'));
  $('nca-export-fig-png').addEventListener('click',()=>exportPlot('png'));
  $('nca-export-fig-svg').addEventListener('click',()=>exportPlot('svg'));
  window.PKNCAUI={onTab:compute,onDataChange:()=>{const s=get();if(s?.activeTab==='nca')compute();}};
})();
