import test from 'node:test';import assert from 'node:assert/strict';
import {mergeSnapshot} from '../lib/scoring.mjs';
import {recoverTbestHistory} from '../lib/tbest-history.mjs';
import {tbestReport,referenceImpact,tbestChangeText} from '../lib/tbest-analysis.mjs';
import {createFeedClient,makePatch} from '../lib/feed.mjs';
const at=n=>new Date(1800000000000+n*60000).toISOString();
const snap=(n,best=[10,20],ids=['s1','s2'])=>({capturedAt:at(n),testcaseIds:['a','b'],tbest:best,tbestSubmissionIds:ids,teams:[{id:'t',name:'Team',officialRank:1,status:'Pass',officialScore:80,submissionId:'s1',submittedAt:at(0),latest:[10,40]}]});
test('TBest ledger keeps changes and ownership without adding heartbeat points or trimming with team trends',()=>{
 let data=mergeSnapshot(null,snap(0));data=mergeSnapshot(data,snap(1));assert.equal(data.tbestHistory.length,1);
 data=mergeSnapshot(data,snap(2,[8,20]));data=mergeSnapshot(data,snap(3,[8,25]));data=mergeSnapshot(data,snap(4,[8,25],['s3','s2']));
 assert.equal(data.tbestHistory.length,4);const report=tbestReport(data);assert.equal(report.faster,1);assert.equal(report.slower,1);assert.equal(report.ownerChanges,1);assert.equal(report.changeCount,2);assert.equal(report.batchCount,2);
 const trimmed={...data,teams:data.teams.map(t=>({...t,history:[]}))};assert.equal(tbestReport(trimmed).history[0].at,at(0));
 const reset=mergeSnapshot(data,{...snap(5),testcaseIds:['new','b']});assert.equal(reset.tbestHistory.length,1);
});
test('legacy recovery de-duplicates shared snapshots, ignores malformed vectors and preserves observed timestamps',()=>{
 const data={...snap(4,[8,25]),teams:[{id:'t',history:[{at:at(0),tbest:[10,20]},{at:at(2),tbest:[8,20]},{at:at(3),tbest:[8,25]},{at:at(1),tbest:[NaN,20]}]},{id:'u',history:[{at:at(0),tbest:[10,20]},{at:at(2),tbest:[8,20]}]}]};
 const h=recoverTbestHistory(data);assert.deepEqual(h.slice(0,3).map(p=>p.at),[at(0),at(2),at(3)]);assert.equal(h[0].evidence,'legacy');
 const report=tbestReport(data,{from:Date.parse(at(2)),caseIndex:1,direction:'slower'});assert.equal(report.events.length,1);assert.equal(report.cases[1].netPct,25);assert.equal(tbestReport({...snap(0),teams:[]}).changeCount,0);
});
test('reference impact holds the full selected submission fixed and uses all changes in the same batch',()=>{
 let data=mergeSnapshot(null,snap(0));data=mergeSnapshot(data,snap(1,[5,10]));const r=tbestReport(data),impact=referenceImpact(data,'t',r.events[0]);
 assert.equal(impact.submission.submissionId,'s1');assert.ok(impact.delta<0);assert.equal(referenceImpact(data,'missing',r.events[0]),null);assert.equal(r.cases[0].owners.method,'unmatched-id');
 assert.equal(tbestReport(mergeSnapshot(null,snap(0))).cases[0].owners.teams[0].name,'Team');
});
test('time-only owner matches are marked unverified and cannot be backdated from later observations',()=>{
 const data=mergeSnapshot(null,snap(0));data.tbestSubmissionIds=['',''];data.tbestHistory[0].submissionIds=['',''];
 const report=tbestReport(data);assert.equal(report.cases[0].owners.method,'observed-match');
 const later={...data,teams:data.teams.map(t=>({...t,submissions:[{submissionId:'later',times:[5,40],observedAt:at(5)}],history:[]})),capturedAt:at(6),tbest:[5,20],tbestHistory:[...data.tbestHistory,{at:at(2),tbest:[5,20],submissionIds:['',''],evidence:'snapshot'}]};
 const next=tbestReport(later);assert.equal(next.events[0].owner.teams.length,0);assert.equal(next.cases[0].owners.method,'observed-match');
});
test('cloud replay upgrades legacy history and immutable backups retain the complete TBest ledger',async()=>{
 const baseline=mergeSnapshot(null,snap(0));delete baseline.tbestHistory;delete baseline.tbestHistoryVersion;
 const source=snap(1,[8,20]),patch=makePatch(snap(0),source);
 const head={protocol:1,baseline_url:'https://baseline.test/latest.json',baseline_cursor:0,baseline_poll_count:0,seq:1,poll_count:1,success_at:at(1),baseline_version:'v1'};
 const feed=createFeedClient('https://collector.test',{fetcher:async url=>Response.json(String(url).includes('baseline.test')?baseline:String(url).includes('/api/head')?head:{events:[{seq:1,pollCount:1,patch}]})});
 const merged=await feed.read();assert.equal(merged.tbestHistoryVersion,1);assert.equal(merged.tbestHistory.length,2);
 const checkpoint=feed.checkpoint(),restored=createFeedClient('https://collector.test',{fetcher:async url=>Response.json(String(url).includes('/api/head')?{...head,baseline_cursor:1,baseline_poll_count:1}:checkpoint)});
 assert.deepEqual((await restored.read()).tbestHistory,merged.tbestHistory);assert.equal(tbestReport(await restored.read()).faster,1);
});
test('TBest change descriptions name verified or matched teams without claiming unconfirmed attribution',()=>{
 const event={index:2,direction:'faster',changePct:-12.34,owner:{method:'official-id',teams:[{name:'甲队'}]}};
 assert.equal(tbestChangeText(event),'点3 甲队 · 降低 12.34%');assert.match(tbestChangeText({...event,owner:{method:'observed-match',teams:[{name:'乙队'}]}}),/乙队（耗时匹配）/);assert.match(tbestChangeText({...event,owner:{method:'unknown',teams:[]}}),/队伍未确认/);
});
