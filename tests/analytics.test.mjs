import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotChanges,hasChanges,estimateScenario,submissionsFor,rankTeams,rankingExport,compareRankingRows,reachesReference,referenceRelation} from '../lib/analytics.mjs';
const sample=()=>({testcaseIds:['a','b'],tbest:[10,10],capturedAt:'2026-11-21T12:00:00Z',teams:[{id:'a',name:'A',historical:[10,20],latest:[10,20],officialRank:1,submissions:[{submissionId:'a1',times:[10,20]}]},{id:'b',name:'B',historical:[20,20],latest:[20,20],officialRank:2,submissions:[{submissionId:'b1',times:[20,20]}]}]});
test('scenario recomputes rank without changing real data or TBest',()=>{const d=sample(),original=JSON.stringify(d),s=estimateScenario(d,'b','history',[10,10]);assert.equal(s.after,100);assert.equal(s.beforeRank,2);assert.equal(s.rank,1);assert.ok(s.delta>0);assert.equal(JSON.stringify(d),original);assert.equal(estimateScenario(d,'b','history',[1,1]).after,100)});
test('scenario counts missing points as zero and rejects invalid times',()=>{const d=sample();assert.equal(estimateScenario(d,'a','official',[10,null]).after,50);for(const v of [0,-1,NaN,Infinity,'10'])assert.throws(()=>estimateScenario(d,'a','history',[v,10]));assert.throws(()=>estimateScenario(d,'absent','single',[10,10]));assert.throws(()=>estimateScenario(d,'a','single',[10]))});
test('changes distinguish rank movement, reference changes, new teams and unchanged snapshots',()=>{const a=sample(),b=structuredClone(a);b.capturedAt='2026-11-21T12:01:00Z';b.tbest[0]=9;b.teams[1].historical=[9,10];b.teams[1].officialRank=1;b.teams[0].officialRank=2;const c=snapshotChanges(a,b);assert.equal(c.ranks.b.history,1);assert.equal(c.ranks.a.official,-1);assert.deepEqual(c.tbest,[{index:0,before:10,after:9}]);assert.ok(hasChanges(c));assert.equal(hasChanges(snapshotChanges(a,a)),false);assert.equal(snapshotChanges(null,a),null);b.testcaseIds=['x','y'];assert.equal(snapshotChanges(a,b),null)});
test('historical comparison always scores full submissions under the same current reference',()=>{const d=sample(),t={submissions:[{submissionId:'x',times:[10,null]},{submissionId:'y',times:[20,10]}]};const ss=submissionsFor(t,d.tbest);assert.equal(ss[0].score,50);assert.equal(ss[1].times[0],20);assert.ok(ss[1].score>50);assert.equal(ss[0].key,'0')});

test('ranking views and CSV keep composite, selected historical and official submissions separate',()=>{
 const d={tbest:[10,10],teams:[{id:'a',name:'A',officialRank:3,officialScore:7,submissionId:'latest',submitter:'最新提交人',status:'Wrong Answer',submittedAt:'2026-11-24T02:00:00Z',latest:[30,null],historical:[10,10],submissions:[{submissionId:'winner',submitter:'历史提交人',status:'Pass',submittedAt:'2026-11-24T01:00:00Z',times:[10,20]}]}]};
 const history=rankTeams(d,'history')[0],single=rankTeams(d,'single')[0],official=rankTeams(d,'official')[0];
 assert.equal(history.metadata,null);assert.equal(history.viewScore,100);assert.equal(single.metadata.submissionId,'winner');assert.equal(single.metadata.submitter,'历史提交人');assert.equal(single.metadata.status,'Pass');assert.deepEqual(single.times,[10,20]);assert.notEqual(single.viewScore,7);
 assert.equal(official.rank,3);assert.equal(official.viewScore,7);assert.equal(official.metadata.submissionId,'latest');assert.deepEqual(official.times,[30,null]);assert.notEqual(official.analysisScore,official.viewScore);
 for(const mode of ['history','single','official']){
  const result=rankingExport(d,mode);assert.equal(result.rows[0].length,result.headers.length);
  const record=Object.fromEntries(result.headers.map((h,i)=>[h,result.rows[0][i]]));
  if(mode==='single'){assert.equal(record['提交ID'],'winner');assert.equal(record['所选提交人'],'历史提交人');assert.equal(record['最佳单次重算分'],single.viewScore);assert.equal(record['点1耗时(μs)'],10);assert.ok(!result.headers.some(h=>h.includes('官方分')||h.includes('最新')));assert.ok(!result.rows[0].includes('latest'))}
  if(mode==='history'){assert.ok(!result.headers.some(h=>/提交人|提交ID|提交时间|状态|官方分/.test(h)));assert.equal(record['逐点组合分'],100)}
  if(mode==='official'){assert.equal(record['官方分'],7);assert.equal(record['提交ID'],'latest');assert.equal(record['官方排名'],3);assert.equal(record['当前TBest重算分（仅供分析）'],official.analysisScore)}
 }
 const changed={...d,teams:d.teams.map(t=>({...t,officialScore:99}))};assert.equal(rankTeams(changed,'single')[0].viewScore,single.viewScore);
});

test('missing performance and reference values cannot become TBest or sort before valid times',()=>{
 const d=sample();d.tbest=[null,10];d.teams[0].latest=[5,null];d.teams[1].latest=[10,20];
 const rows=rankTeams(d,'official');assert.equal(rows[0].bestCount,0);assert.equal(reachesReference(5,null),false);assert.equal(reachesReference(null,10),false);
 for(const ascending of [true,false])assert.equal([...rows].sort((a,b)=>compareRankingRows(a,b,'point1',ascending))[0].id,'b');
 const missing={id:'x',name:'No records',officialRank:4};assert.deepEqual(rankTeams({...d,teams:[missing]},'single')[0].times,[null,null]);
});

test('official-view optimization reports a recomputed baseline rank, not the official position',()=>{
 const d=sample();d.teams[0].latest=[30,30];d.teams[1].latest=[10,10];
 assert.equal(rankTeams(d,'official')[0].id,'a');assert.equal(estimateScenario(d,'a','official',[10,10]).beforeRank,2);
});

test('historical faster case3 is not a second current TBest and capped scores remain unchanged',()=>{
 const d={testcaseIds:['case3'],tbest:[1.9835],teams:[{id:'old',name:'你说的队',officialRank:2,historical:[.5866666666666667],latest:[null]},{id:'current',name:'v4.1-fLaSh',officialRank:1,historical:[1.9835],latest:[1.9835]}]};
 const old=rankTeams(d,'history').find(t=>t.id==='old'),current=rankTeams(d,'history').find(t=>t.id==='current');
 assert.equal(old.bestCount,0);assert.equal(old.historicalFasterCount,1);assert.equal(old.analysisScore,100);assert.equal(current.bestCount,1);assert.equal(current.historicalFasterCount,0);
 assert.equal(referenceRelation(.5866666666666667,1.9835),'historical-faster');assert.equal(referenceRelation(1.9835,1.9835),'matched');assert.equal(referenceRelation(1.98350001,1.9835),'slower');assert.equal(referenceRelation(null,1.9835),'missing');assert.equal(referenceRelation(1,null),'missing');
 const exported=rankingExport(d,'history'),row=exported.rows.find(r=>r[1]==='你说的队');assert.equal(row[exported.headers.indexOf('TBest点数')],0);
});
