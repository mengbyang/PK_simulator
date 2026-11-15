const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('./core.js'), N=require('./nca-core.js');
const close=(a,b,tol=1e-7)=>{assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`Expected ${a} ≈ ${b}`)};
// Ideal monoexponential - should be a perfect terminal fit, including early post Cmax concentrations.
const ideal=[{t:0,c:0},{t:1,c:100},{t:2,c:50},{t:3,c:25},{t:4,c:12.5},{t:5,c:6.25}];
const fits=N.terminalCandidates(ideal,{ivBolus:false});
assert.equal(fits.length,2);close(N.chooseBest(fits).lambda,Math.log(2));close(N.chooseBest(fits).halfLife,1);assert.equal(N.chooseBest(fits).n,4);
const q=N.calcProfile(ideal,{method:'linear'});
assert.equal(N.calcProfile([{t:1,c:10}],{assumeZeroAtDose:true}),null);
assert.equal(q.result.Tmax,1);assert.equal(q.result.Cmax,100);assert.equal(q.result.Tlast,5);
close(q.result.AUCall, (100+0)/2+(100+50)/2+(50+25)/2+(25+12.5)/2+(12.5+6.25)/2);
close(q.result.AUMClast, N.integration(ideal,'linear',1).aumc);
assert.ok(q.result.AUCINF_obs>q.result.AUClast);
// Missing values are discarded; observed zero remains counted in a sparse mean.
const sparse=[{ID:'A',Time:0,Conc:0,Route:'PO',Group:'A'}, {ID:'B',Time:0,Conc:0,Route:'PO',Group:'A'},
  {ID:'A',Time:1,Conc:20,Route:'PO',Group:'A'},{ID:'B',Time:1,Conc:40,Route:'PO',Group:'A'},
  {ID:'A',Time:2,Conc:10,Route:'PO',Group:'A'},{ID:'B',Time:2,Conc:0,Route:'PO',Group:'A'},
  {ID:'A',Time:3,Conc:5,Route:'PO',Group:'A'},{ID:'B',Time:3,Conc:'BLQ',Route:'PO',Group:'A'},
  {ID:'A',Time:4,Conc:2.5,Route:'PO',Group:'A'},{ID:'B',Time:4,Conc:'',Route:'PO',Group:'A'}];
const out=N.calculate(sparse,{timeCol:'Time',valueCol:'Conc',animalCol:'ID',groupCols:['Group'],routeCol:'Route',mode:'sparse'});
assert.equal(out.length,1);
assert.equal(out[0].points[2].c,5);assert.equal(out[0].points[2].samples.length,2);
close(out[0].result.SE_Cmax,10); // 20,40: sample sd / sqrt(2)=10
// Serial covariance: exact perfectly correlated subjects at adjacent times -> AUC SE equals individual AUC sample SE.
const covProfile=[{t:0,c:0,samples:[{c:0,animal:'A'},{c:0,animal:'B'}]},
  {t:1,c:15,samples:[{c:10,animal:'A'},{c:20,animal:'B'}]},
  {t:2,c:30,samples:[{c:20,animal:'A'},{c:40,animal:'B'}]}];
const expectedAucSample=[0.5*10+0.5*(10+20),0.5*20+0.5*(20+40)];
close(N.sparseAucSE(covProfile), Math.sqrt(C.summarize(expectedAucSample).sd**2/2));
// Optional local regression fixture; raw user study data is never committed to GitHub.
if(fs.existsSync('../Anima.txt')){
  const an=C.rowsFromMatrix(C.parseCSV(fs.readFileSync('../Anima.txt','utf8')));
  const res=N.calculate(an.rows,{timeCol:'Sampling time (h)',valueCol:'Estimated Tissue Conc 3 (report, ng/g)',animalCol:'Animal ID',groupCols:['Analyte','Sample Type','Group'],mode:'sparse',routeCol:'Group'});
  assert.equal(res.length,30);
  const p=res.find(p=>p.labels.join('|')==='curcumin|Heart|IN');
  assert.ok(p);close(p.points.find(p=>p.t===0.033).c,(0+345+352)/3);close(p.result.SE_Cmax,Math.sqrt(C.summarize([0,345,352]).sd**2/3));
  const s=res.find(p=>p.labels.join('|')==='sildenafil|Heart|IN');assert.ok(s);assert.ok(s.result.AUClast>0);
}
console.log('NCA numerical tests passed.');