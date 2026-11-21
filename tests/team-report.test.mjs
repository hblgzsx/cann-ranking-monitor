import test from 'node:test';import assert from 'node:assert/strict';
import {buildTeamReport,analyzeTeamSubmission} from '../lib/team-report.mjs';
const data={tbest:[10,10],teams:[{id:'a',name:'A',officialRank:2,historical:[10,10],submissions:[{submissionId:'a1',times:[10,30],submittedAt:'2026-11-21T01:00:00Z',status:'Pass'},{submissionId:'a2',times:[30,10],submittedAt:'2026-11-21T02:00:00Z',status:'Wrong Answer'}]},{id:'b',name:'B',officialRank:1,historical:[10,15],submissions:[{submissionId:'b1',times:[10,15]}]}]};
test('team report compares complete submissions and attributes total-score gaps to cases',()=>{const r=buildTeamReport(data,'a','b','2026-11-21');assert.equal(r.rank,2);assert.equal(r.opponent.team.id,'b');assert.equal(r.combo,100);assert.ok(r.comboGap>0);assert.ok(Math.abs(r.points.reduce((s,p)=>s+p.contribution,0)+(r.opponent.best.score-r.best.score))<1e-10);assert.equal(r.weakest[0].index,1);assert.equal(r.identifiedCount,2);assert.equal(r.todayCount,2);assert.equal(r.passRate,50);assert.equal(r.trend[1].bestSoFar,r.best.score)});
test('single-team or archived reports do not invent a rival or active rank',()=>{const solo=buildTeamReport({...data,teams:[data.teams[0]]},'a');assert.equal(solo.opponent,null);assert.equal(solo.scoreGap,null);const archived=buildTeamReport({...data,teams:[{...data.teams[0],archived:true},data.teams[1]]},'a');assert.equal(archived.rank,null);assert.throws(()=>buildTeamReport(data,'missing'))});
test('selected submission priorities and comparison use its complete vector, including failed points',()=>{
 const report=buildTeamReport(data,'a');const analysis=analyzeTeamSubmission(report,data.tbest,'a2','a1');
 assert.equal(analysis.selected.submissionId,'a2');assert.equal(analysis.weakest[0].index,0);assert.equal(analysis.improved,1);assert.equal(analysis.regressed,1);assert.ok(Math.abs(analysis.points.reduce((sum,p)=>sum+p.contribution,0)-analysis.delta)<1e-10);
 const missing=analyzeTeamSubmission(report,data.tbest,'not-recorded');assert.equal(missing.selected,null);assert.equal(missing.score,null);
 const failed=analyzeTeamSubmission({...report,records:[{...report.records[0],submissionId:'failed',key:'failed',times:[null,10]}]},data.tbest,'failed','failed');assert.equal(failed.weakest[0].score,0);assert.equal(failed.weakest[0].loss,50);
});
test('latest selection follows submission time, stable IDs survive updates and TBest is applied anew',()=>{
 const report=buildTeamReport(data,'a');assert.equal(analyzeTeamSubmission(report,data.tbest,'latest').selected.submissionId,'a2');
 assert.equal(analyzeTeamSubmission(report,data.tbest,'best').selected.submissionId,'a1');
 const first=analyzeTeamSubmission(report,[10,10],'a2'),next=analyzeTeamSubmission(report,[5,5],'a2');assert.ok(next.score<first.score);assert.equal(next.selected.submissionId,'a2');
 assert.equal(analyzeTeamSubmission({...report,records:[],best:null},data.tbest).selected,null);
 const legacy={...report,records:[{key:'old',times:[30,30]},{key:'best-old',times:[10,10]}],best:{submissionId:'',times:[10,10]}};assert.equal(analyzeTeamSubmission(legacy,data.tbest,'best').selected.key,'best-old');
});
