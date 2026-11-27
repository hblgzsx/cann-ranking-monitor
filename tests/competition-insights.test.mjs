import test from 'node:test';import assert from 'node:assert/strict';
import {defaultRegions,defaultMembership} from '../lib/default-regions.mjs';
import {normalizePrefixes,readDefaultRegions,withDefaultRegions,prefixStorageKey,rosterBackupKey} from '../lib/team-prefixes.mjs';
import {asOf,rangeFor,teamTimeline,changeAt,buildCaseReport,regionReport,drawdownReport,replayRanking,leaderReport,archiveReport,sampleTimeline} from '../lib/competition-insights.mjs';
const at=n=>new Date(Date.UTC(2026,10,27,0,n)).toISOString();
const sample=()=>({schemaVersion:1,capturedAt:at(30),startedAt:at(0),snapshotCount:121,testcaseIds:['c1'],tbest:[10],tbestHistory:[{at:at(0),tbest:[10]},{at:at(10),tbest:[8]},{at:at(30),tbest:[10]}],teams:[{id:'a',name:'A',latest:[20],historical:[10],submissionId:'a3',submittedAt:at(25),lastSeen:at(30),officialRank:2,officialScore:50,submissions:[{submissionId:'a1',times:[10],submittedAt:at(0)}],history:[{at:at(0),official:70,latest:[10],tbest:[10],submissionId:'a1'},{at:at(5),official:90,latest:[10],tbest:[10],submissionId:'a2'},{at:at(25),official:50,latest:[20],tbest:[10],submissionId:'a3'}]},{id:'b',name:'B',latest:[12],historical:[12],submissionId:'b2',submittedAt:at(25),lastSeen:at(30),officialRank:1,officialScore:80,submissions:[],history:[{at:at(2),official:60,latest:[15],tbest:[10],submissionId:'b1'},{at:at(25),official:80,latest:[12],tbest:[10],submissionId:'b2'}]}]});

test('reference roster covers six regions, confirmed aliases and stable IDs without guessing unknown renames',()=>{
 assert.deepEqual(defaultRegions.map(r=>r.name),['京津东北','西南','西北','上合','杭夏','江山']);
 assert.equal(defaultMembership({id:'6b00195685ad43bbe0627a47',name:'changed'}).regionId,'shanghe');
 assert.equal(defaultMembership({name:' NSJLoop '}).regionId,'jing');assert.equal(defaultMembership({id:'6b001d6985ad43bbe06aac6b',name:'GGbond'}).regionId,'southwest');
 assert.equal(defaultMembership({id:'wrong-id',name:'Lizzop'}),null);assert.equal(defaultMembership({id:'unknown',name:'unknown'}),null);
 assert.equal(defaultMembership({id:'6b004d3585ad43bbe0ce7421',name:'紫金智汇昇腾队'}).seed,'外卡');
});
test('default region migration backs up old assignments once and preserves later manual overrides and explicit unassignment',()=>{
 const id='6b00195685ad43bbe0627a47',old=normalizePrefixes({entries:{[id]:{prefix:'以前的赛区',color:'green'}}}),raw=JSON.stringify(old),values=new Map([[prefixStorageKey,raw]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 let result=readDefaultRegions(storage);assert.equal(result.entries[id].prefix,'上合');assert.equal(values.get(rosterBackupKey),raw);
 result.assignments[id]='default-jing';result.regions.find(r=>r.id==='default-jing').color='pink';values.set(prefixStorageKey,JSON.stringify(result));
 result=readDefaultRegions(storage);assert.equal(result.entries[id].prefix,'京津东北');assert.equal(result.entries[id].color,'pink');assert.equal(values.get(rosterBackupKey),raw);
 delete result.assignments[id];result.unassignedTeamIds=[id];values.set(prefixStorageKey,JSON.stringify(result));result=readDefaultRegions(storage,[{id,name:'Lizzop'}]);assert.equal(result.entries[id],undefined);
 assert.equal(withDefaultRegions(result,[{id,name:'Lizzop'}],true).entries[id].prefix,'上合');
});
test('as-of baselines never read future data and Beijing day/week ranges use UTC+8',()=>{
 const rows=[{at:at(0),score:1},{at:at(10),score:2}];assert.equal(asOf(rows,Date.parse(at(5))).score,1);assert.equal(asOf(rows,Date.parse(at(-1))),null);
 assert.equal(rangeFor('day','2026-11-27',Date.parse(at(30))).from,Date.parse('2026-11-26T16:00:00Z'));
 assert.equal(rangeFor('week','2026-11-27',Date.parse(at(30))).from,Date.parse('2026-11-22T16:00:00Z'));
 assert.ok(rangeFor('day','2026-11-28',Date.parse(at(30))).from>rangeFor('day','2026-11-28',Date.parse(at(30))).to);
});
test('drawdown uses real records and official version boundaries, with configurable thresholds and recovery',()=>{
 const d=sample(),report=drawdownReport(d,{basis:'official',minPeak:80,minDrop:20,minPercent:20}),a=report.find(r=>r.teamId==='a');
 assert.equal(a.peak.score,90);assert.equal(a.current.score,50);assert.equal(a.drop,40);assert.ok(a.flagged);
 const timeline=teamTimeline(d,d.teams[0],'official');assert.equal(changeAt(timeline,Date.parse(at(30)),30*60000).value,-20);assert.equal(changeAt(timeline,Date.parse(at(30)),31*60000),null);
 const changed=sample();changed.tbest=[5];assert.equal(drawdownReport(changed,{basis:'official'}).find(r=>r.teamId==='a').drop,0);
 const recovered=sample();recovered.teams[0].officialScore=95;assert.equal(drawdownReport(recovered,{basis:'official',minPeak:80,minDrop:20,minPercent:20}).find(r=>r.teamId==='a').status,'recovered');
 assert.throws(()=>drawdownReport(d,{minPercent:101}));
});
test('case workbench keeps current TBest, separates official ownership from exact matches and never invents row times',()=>{
 const d=sample();d.tbest=[10];const r=buildCaseReport(d,0,{mode:'history'});assert.equal(r.T,10);assert.equal(r.owner.method,'observed-match');assert.equal(r.matching[0].teamId,'a');assert.equal(r.rows[0].submissionId,'a1');
 const current=buildCaseReport(d,0,{mode:'official'});assert.equal(current.rows[0].teamId,'b');assert.equal(current.rows.find(r=>r.teamId==='a').time,20);assert.equal(current.changes[0].before,10);
 assert.equal(buildCaseReport({...d,tbestSubmissionIds:['a1']},0).owner.method,'official-submission');
});
test('regional averages include zero, use actual top3 size and keep unknown teams separate',()=>{
 const d=sample();d.teams[0].officialScore=0;const config=normalizePrefixes({version:2,regions:[{id:'one',name:'One',color:'blue'},{id:'empty',name:'Empty',color:'green'}],assignments:{a:'one',b:'one'}}),report=regionReport(d,config,'official'),group=report.groups[0];
 assert.equal(group.average,40);assert.equal(group.top3,40);assert.equal(group.scored,2);assert.equal(report.groups[1].average,null);
 delete config.assignments.b;assert.equal(regionReport(d,config,'official').unknown.length,1);
});
test('replay does not show teams before first observation, handles ties, and leader intervals preserve observed evidence',()=>{
 const d=sample();assert.deepEqual(replayRanking(d,Date.parse(at(1)),'official').map(r=>r.teamId),['a']);
 assert.equal(replayRanking(d,Date.parse(at(26)),'official')[0].teamId,'b');
 const leader=leaderReport(d,{},'official');assert.equal(leader.transitions,1);assert.equal(leader.intervals[0].leaders[0].teamId,'a');assert.equal(leader.intervals[1].leaders[0].teamId,'b');
 const archive=archiveReport(d);assert.notEqual(archive.events.length,d.snapshotCount);assert.equal(archive.sampleCount,121);assert.equal(archive.days[0].day,'2026-11-27');
});
test('new analyses consistently exclude invalidated timings while preserving raw official scores',()=>{
 const d=sample();d.teams[0].invalidatedResults=[{index:0,caseId:'c1',submissionId:'a1',time:10}];
 assert.equal(teamTimeline(d,d.teams[0],'recomputed')[0].score,0);assert.equal(teamTimeline(d,d.teams[0],'official')[0].score,70);
 const rows=Array.from({length:100},(_,i)=>({at:at(i),score:i===20?999:i===30?-1:10,version:'one'}));const sampled=sampleTimeline(rows,3600000,500);assert.ok(sampled.some(r=>r.score===999));assert.ok(sampled.some(r=>r.score===-1));
});
