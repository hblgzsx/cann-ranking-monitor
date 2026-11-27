import test from 'node:test';import assert from 'node:assert/strict';
import {applyResultValidity,invalidatedResultNote} from '../lib/result-validity.mjs';
import {observedSubmissions,bestHistoricalSubmission,mergeSnapshot} from '../lib/scoring.mjs';
import {rankTeams} from '../lib/analytics.mjs';
import {submissionRecords} from '../lib/submissions.mjs';
import {buildTeamReport} from '../lib/team-report.mjs';
import {tbestReport} from '../lib/tbest-analysis.mjs';
import {alignHistory} from '../lib/case-evolution.mjs';
const at=n=>new Date(Date.UTC(2026,10,22)+n*60000).toISOString();
function sample(){return {schemaVersion:1,testcaseIds:['c3','other'],capturedAt:at(5),snapshotCount:8,tbest:[1.9835,10],tbestHistory:[{at:at(1),tbest:[.5866666666666667,10]},{at:at(3),tbest:[2.4,10]},{at:at(5),tbest:[1.9835,10]}],teams:[{id:'old',name:'你说的队',historical:[.5866666666666667,10],latest:[5,10],submissionId:'latest',officialRank:2,officialScore:30,submittedAt:at(4),submissions:[{submissionId:'cleared',status:'Runtime Error',times:[.5866666666666667,null],submittedAt:at(0),observedAt:at(1)},{submissionId:'fallback',status:'Pass',times:[3,10],submittedAt:at(2),observedAt:at(2)}],history:[]},{id:'now',name:'v4.1-fLaSh',historical:[1.9835,10],latest:[1.9835,10],submissionId:'valid',submittedAt:at(4),officialRank:1,officialScore:100,submissions:[],history:[]}]}}
test('reference rollback excludes cleared historical case from all current analyses and retains original evidence',()=>{
 const original=sample(),copy=structuredClone(original),d=applyResultValidity(original),team=d.teams[0],record=observedSubmissions(team,2).find(s=>s.submissionId==='cleared');
 assert.deepEqual(original,copy);assert.deepEqual(d.tbest,original.tbest);assert.deepEqual(d.tbestHistory,original.tbestHistory);assert.equal(d.snapshotCount,8);assert.deepEqual(team.latest,original.teams[0].latest);assert.equal(team.officialScore,30);
 assert.deepEqual(team.historical,[3,10]);assert.equal(record.times[0],null);assert.equal(record.rawTimes[0],.5866666666666667);assert.match(invalidatedResultNote(record),/已失效/);assert.equal(bestHistoricalSubmission(team,d.tbest).submissionId,'fallback');
 assert.equal(rankTeams(d,'history').find(t=>t.id==='old').bestCount,1);assert.equal(submissionRecords(d).find(r=>r.submissionId==='cleared').score,0);assert.equal(buildTeamReport(d,'old').caseSources[0].time,3);
 assert.deepEqual(applyResultValidity(d),d);
 const ledger=tbestReport(d);assert.equal(ledger.events.find(e=>e.direction==='slower').owner.teams.length,0);
});
test('new submissions after a rollback remain eligible and a new feed merge cannot revive the excluded old ID',()=>{
 const original=sample();original.teams[0].submissions.push({submissionId:'new-pass',times:[1.9,10],submittedAt:at(4),observedAt:at(4)});
 const d=applyResultValidity(original);assert.equal(d.teams[0].historical[0],1.9);assert.equal(observedSubmissions(d.teams[0],2).find(r=>r.submissionId==='new-pass').times[0],1.9);
 const snap={capturedAt:at(6),testcaseIds:original.testcaseIds,tbest:original.tbest,teams:original.teams.map(t=>({...t,latest:t.id==='old'?[.5866666666666667,null]:t.latest,submissionId:t.id==='old'?'cleared':t.submissionId,submittedAt:t.id==='old'?at(0):t.submittedAt}))};
 const merged=applyResultValidity(mergeSnapshot(d,snap));assert.equal(observedSubmissions(merged.teams[0],2).find(r=>r.submissionId==='cleared').times[0],null);assert.equal(merged.teams[0].historical[0],1.9);
});
test('missing references and case additions are not rollback evidence; no team-level disqualification is inferred',()=>{
 const d=sample();d.tbestHistory=[{at:at(1),tbest:[null,10]},{at:at(3),tbest:[2.4,10]}];assert.strictEqual(applyResultValidity(d),d);
 const eligible=applyResultValidity(sample()).teams[0];assert.equal(eligible.invalidatedResults.length,1);assert.equal(eligible.invalidatedResults[0].caseId,'c3');assert.equal(eligible.submissions[1].status,'Pass');
});

test('a checkpoint and later case reordering retain exclusions, while unaffected passed cases still count',()=>{
 const original=sample();original.teams[0].submissions[0].times[1]=10;
 const d=applyResultValidity(original),record=submissionRecords(d).find(s=>s.submissionId==='cleared');assert.deepEqual(record.times,[null,10]);assert.equal(record.score,50);
 const reordered=applyResultValidity(alignHistory(JSON.parse(JSON.stringify(d)),['other','new','c3']));
 const row=submissionRecords(reordered).find(s=>s.submissionId==='cleared');assert.deepEqual(row.times,[10,null,null]);assert.equal(row.invalidatedCases[0].caseId,'c3');assert.equal(row.invalidatedCases[0].index,2);
});

test('masked submission backups retain original evidence after trends are trimmed and cases are reordered',()=>{
 const d=applyResultValidity(sample());
 const checkpoint={...d,teams:d.teams.map(t=>({...t,history:[],submissions:observedSubmissions(t,2)}))};
 const restored=applyResultValidity(alignHistory(checkpoint,['other','new','c3']));
 const record=submissionRecords(restored).find(r=>r.submissionId==='cleared');
 assert.deepEqual(record.times,[null,null,null]);assert.deepEqual(record.rawTimes,[null,null,.5866666666666667]);assert.equal(record.invalidatedCases[0].index,2);
 assert.equal(restored.teams[0].historical[2],3);
});
