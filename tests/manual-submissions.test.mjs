import test from 'node:test';import assert from 'node:assert/strict';
import {applyManualSubmissions,manualSubmissions,manualSubmissionNote} from '../lib/manual-submissions.mjs';
import {mergeSnapshot,bestHistoricalSubmission,observedSubmissions} from '../lib/scoring.mjs';
import {submissionRecords,dayStatistics} from '../lib/submissions.mjs';
import {buildTeamReport} from '../lib/team-report.mjs';
import {liveData} from '../lib/live-data.mjs';
const entry=manualSubmissions[0];
const base=()=>mergeSnapshot(null,{capturedAt:'2026-11-26T01:00:00Z',testcaseIds:entry.testcaseIds,tbest:entry.tbestAtSubmission,total:1,teams:[{id:entry.teamId,name:'Lizzop',latest:entry.times.map(t=>t*2),submissionId:'newer',submittedAt:'2026-11-26T00:47:49Z',submitter:'Cyrus',status:'Pass',officialRank:7,officialScore:30}]});

test('manual submission participates in history and day statistics without altering official latest, TBest or collector counters',()=>{
 const before=base(),saved=structuredClone(before),data=applyManualSubmissions(before),team=data.teams[0];
 assert.deepEqual(before,saved);assert.deepEqual(data.tbest,before.tbest);assert.deepEqual(data.tbestHistory,before.tbestHistory);assert.equal(data.capturedAt,before.capturedAt);assert.equal(data.snapshotCount,before.snapshotCount);
 for(const key of ['latest','submissionId','submittedAt','officialScore','officialRank','status'])assert.deepEqual(team[key],before.teams[0][key]);
 const records=submissionRecords(data),row=records.find(r=>r.submissionId===entry.submissionId);
 assert.deepEqual(row.times,entry.times);assert.equal(row.times[10],23300);assert.equal(row.times[12],11900);assert.equal(row.officialScore,null);assert.equal(row.submittedAt,'2026-11-26T00:43:32.000Z');assert.equal(row.observedAt,entry.importedAt);assert.match(manualSubmissionNote(row),/页面展示精度/);
 assert.equal(bestHistoricalSubmission(team,data.tbest).submissionId,entry.submissionId);assert.deepEqual(team.historical,entry.times);
 assert.equal(dayStatistics(records,data.teams,'2026-11-26').total,2);assert.equal(buildTeamReport(data,entry.teamId).caseSources[4].sources[0].submissionId,entry.submissionId);
 assert.strictEqual(applyManualSubmissions(data),data);
});

test('manual fallback never overwrites an already collected submission with rounded times',()=>{
 const data=base();data.teams[0].submissions.push({submissionId:entry.submissionId,times:entry.times.map(t=>t+.001),submitter:'Cyrus',status:'Pass',officialScore:44});
 assert.strictEqual(applyManualSubmissions(data),data);const row=observedSubmissions(data.teams[0],13).find(r=>r.submissionId===entry.submissionId);assert.equal(row.times[0],2.901);assert.equal(row.officialScore,44);
});

test('manual timings align by stable testcase IDs after reordering and new cases remain missing',()=>{
 const data=base();data.testcaseIds=[entry.testcaseIds[12],'new',entry.testcaseIds[0]];data.tbest=[1440,10,2.15];data.teams[0]={...data.teams[0],latest:[24000,20,6],historical:[24000,20,6],submissions:[],history:[]};
 const row=applyManualSubmissions(data).teams[0].submissions[0];assert.deepEqual(row.times,[11900,null,2.9]);assert.deepEqual(row.assessed,[true,false,true]);
 const other=base();other.teams[0].id='other-team';assert.strictEqual(applyManualSubmissions(other),other);
});

test('navigation immediately includes backfill in a recently synchronized cached snapshot without a network request',async()=>{
 const snapshot={...base(),connection:{mode:'live'}};let calls=0;
 const client=await liveData({store:{load:async()=>({snapshot,checkedAt:Date.parse(snapshot.capturedAt)}),save:async()=>true},now:()=>Date.parse(snapshot.capturedAt)+1000,fetcher:async()=>{calls++;throw Error('unexpected network')}});
 assert.equal(submissionRecords(client.cached).filter(r=>r.submissionId===entry.submissionId).length,1);
 assert.equal(submissionRecords(await client.read()).filter(r=>r.submissionId===entry.submissionId).length,1);assert.equal(calls,0);
});
