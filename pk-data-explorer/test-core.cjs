// Run: node test-core.cjs. Private Anima file is optional via PK_TEST_INPUT.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.js');
assert.deepEqual(C.parseCSV('a,b\r\n"x,y","q""x"\r\n'), [['a','b'],['x,y','q"x']]);
assert.equal(C.numberOrNull('NA'), null);
assert.equal(C.numberOrNull(''), null);
assert.equal(C.numberOrNull('1.2e-3'), 0.0012);
assert.equal(C.numberOrNull(0), 0);
assert.deepEqual(C.summarize([0,10,20]), {n:3,mean:10,sd:10,cv:100});
assert.deepEqual(C.summarize([0,0]), {n:2,mean:0,sd:0,cv:null});
assert.deepEqual(C.summarize([5]), {n:1,mean:5,sd:null,cv:null});
assert.deepEqual(C.summarize(['NA','',null]), {n:0,mean:null,sd:null,cv:null});
assert.equal(C.formatNumber(12345,3,'scientific'), '1.23E+04');
assert.equal(C.formatNumber(0.0012345,3,'decimal'), '0.00123');
const synthetic = C.rowsFromMatrix(C.parseCSV(fs.readFileSync(path.join(__dirname,'sample.csv'),'utf8')));
assert.equal(synthetic.rows.length,288);
const opts = {timeCol:'Sampling time (h)',valueCol:'Concentration (ng/g)',animalCol:'Animal_ID',groupCols:['Analyte','Sample Type','Group']};
const summaries = C.buildStats(synthetic.rows, opts);
assert.equal(summaries.groups.length,12);
assert.deepEqual(summaries.times,[0,0.033,0.25,0.5,1,2,4,6]);
assert.equal(C.makeWideTable(summaries,{groupCols:opts.groupCols}).matrix[0].length,12);
const g = summaries.groups.find(g=>g.identifiers.join('|')==='Metabolite|Heart|IN');
assert.equal(g.summaries.get(6).n,2);
if(process.env.PK_TEST_INPUT){
  const privateRows = C.rowsFromMatrix(C.parseCSV(fs.readFileSync(process.env.PK_TEST_INPUT,'utf8')));
  const result = C.buildStats(privateRows.rows,{timeCol:'Sampling time (h)',valueCol:'Estimated Tissue Conc 3 (report, ng/g)',animalCol:'Animal ID',groupCols:['Analyte','Sample Type','Group']});
  const cur = result.groups.find(g=>g.identifiers.join('|')==='curcumin|Heart|IN');
  assert.ok(cur);
  assert.equal(cur.summaries.get(0.033).n,3);
  assert.ok(Math.abs(cur.summaries.get(0.033).mean-232.3333333)<1e-4);
}
console.log('PASS — CSV parsing, missing values, zero statistics, precision, grouping, wide summary and sample dataset.');
