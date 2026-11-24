import test from 'node:test';import assert from 'node:assert/strict';
import {mergeSnapshot,observedSubmissions,totalScore} from '../lib/scoring.mjs';
import {normalizeRanking} from '../lib/source.mjs';
import {tbestReport} from '../lib/tbest-analysis.mjs';
import {statusGroup} from '../lib/submissions.mjs';
import {createFeedClient,makePatch} from '../lib/feed.mjs';
const at=n=>new Date(1800000000000+n*15000).toISOString();
const snap=(n,ids=['a','b'],best=[10,20],times=[12,24],submissionId='first',status='Pass')=>({capturedAt:at(n),testcaseIds:ids,tbest:best,tbestSubmissionIds:ids.map(id=>'best-'+id),teams:[{id:'t',name:'Team',officialRank:1,status,officialScore:80,submissionId,latest:times}]});
test('multiple case expansions and reorderings preserve submission IDs, start time, archived teams and TBest history',()=>{
 let data=mergeSnapshot(null,snap(0));data=mergeSnapshot(data,snap(1,['a','b'],[8,20],[12,23],'second'));
 data.teams.push({...data.teams[0],id:'archived',archived:true});
 data=mergeSnapshot(data,snap(2,['b','c','a'],[20,null,8],[null,null,null],'second','Incomplete'));
 assert.equal(data.startedAt,at(0));assert.equal(data.snapshotCount,3);assert.deepEqual(data.teams[0].historical,[23,null,12]);
 assert.deepEqual(data.teams[0].submissions.find(s=>s.submissionId==='first').times,[24,null,12]);assert.deepEqual(data.teams[1].historical,[23,null,12]);
 assert.deepEqual(data.tbestHistory[0].tbest,[20,null,10]);assert.deepEqual(data.tbestStatus,['official','missing','official']);
 data=mergeSnapshot(data,snap(3,['b','c','a'],[20,30,8],[24,33,11],'third'));
 data=mergeSnapshot(data,snap(4,['d','a','b','c'],[40,8,20,30],[null,null,null,null],'third','Incomplete'));
 const records=observedSubmissions(data.teams[0],4);assert.equal(records.length,3);assert.deepEqual(records.find(s=>s.submissionId==='third').times,[null,11,24,33]);assert.equal(data.caseStages.length,3);
 const report=tbestReport(data);assert.equal(report.faster,1);assert.ok(report.history.some(p=>p.at===at(0)));assert.equal(report.cases[3].start,30);assert.equal(report.cases[3].minimum,30);
});
test('missing official reference is retained by ID with timestamp, and new cases never borrow another reference',()=>{
 const first=mergeSnapshot(null,snap(0));const next=mergeSnapshot(first,snap(1,['b','a','c'],[null,null,null],[null,null,null],'first','Incomplete'));
 assert.deepEqual(next.tbest,[20,10,null]);assert.deepEqual(next.tbestStatus,['retained','retained','missing']);assert.deepEqual(next.tbestLastValidAt,[at(0),at(0),null]);assert.deepEqual(next.tbestSubmissionIds,['best-b','best-a','']);
 assert.equal(tbestReport(next).changeCount,0);assert.equal(totalScore([20,10,null],next.tbest),200/3);
 const recovered=mergeSnapshot(next,snap(2,['b','a','c'],[18,9,30],[20,12,35],'new'));assert.deepEqual(recovered.tbestStatus,['official','official','official']);assert.equal(tbestReport(recovered).faster,2);
});
test('incomplete same submission keeps previously observed results, but explicit failed reevaluation and different IDs cannot inherit them',()=>{
 const first=mergeSnapshot(null,snap(0)),partial=snap(1,['a','b','c'],[10,20,30],[null,null,null],'first','Incomplete');partial.teams[0].latestAssessed=[false,false,false];
 const next=mergeSnapshot(first,partial);assert.deepEqual(next.teams[0].submissions[0].times,[12,24,null]);assert.deepEqual(next.teams[0].latest,[null,null,null]);
 const failed=snap(2,['a','b','c'],[10,20,30],[null,24,null],'first','Wrong Answer');failed.teams[0].latestAssessed=[true,true,false];const reevaluated=mergeSnapshot(next,failed);assert.deepEqual(reevaluated.teams[0].submissions[0].times,[null,24,null]);assert.deepEqual(reevaluated.teams[0].historical,[12,24,null]);
 const different=mergeSnapshot(next,snap(2,['a','b','c'],[10,20,30],[null,null,null],'different','Incomplete'));assert.deepEqual(different.teams[0].submissions.find(s=>s.submissionId==='different').times,[null,null,null]);assert.equal(statusGroup('Incomplete'),'pending');
});
test('normalizer admits missing TBest and incomplete evaluations without treating a missing result as a failure',()=>{
 const payload={testcases:[{_id:'a',tbest:null},{_id:'b',tbest:20},{_id:'c',tbest:0}],rows:[{team:{_id:'t'},status:'Incomplete',result:[{testcase_id:'b',testcase_status:'Wrong Answer',time:9}]}]};const s=normalizeRanking(payload,at(0));assert.deepEqual(s.tbest,[null,20,null]);assert.deepEqual(s.teams[0].latestAssessed,[false,true,false]);assert.deepEqual(s.teams[0].latest,[null,null,null]);assert.doesNotThrow(()=>mergeSnapshot(null,s));
});

test('a legacy browser cache that lost its earlier case stage is rebuilt even when the website seed cannot load',async()=>{
 const old=snap(0),added=snap(1,['a','b','c'],[10,20,30],[13,25,40],'new');
 const baseline=mergeSnapshot(null,old);delete baseline.caseHistoryVersion;
 const broken=mergeSnapshot(null,added);delete broken.caseHistoryVersion;
 const cached={endpoint:'https://collector.test',merged:broken,source:added,cursor:1,pollCount:1};let downloaded=0;
 const client=createFeedClient('https://collector.test',{cache:cached,loadSeed:async()=>{throw Error('seed offline')},fetcher:async url=>{
  if(url.includes('/api/head'))return Response.json({protocol:1,baseline_url:'https://base.test',baseline_cursor:0,baseline_poll_count:0,seq:1,poll_count:1,success_at:at(1)});
  if(url==='https://base.test'){downloaded++;return Response.json(baseline)}return Response.json({events:[{seq:1,pollCount:1,patch:makePatch(old,added)}]});
 }});
 const data=await client.read();assert.equal(downloaded,1);assert.equal(data.startedAt,at(0));assert.equal(data.teams[0].submissions.length,2);assert.equal(data.caseHistoryVersion,1);
});
