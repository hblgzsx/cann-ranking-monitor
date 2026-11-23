import test from 'node:test';import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createSnapshotStore,recordSnapshot} from '../lib/snapshot-store.mjs';
import {liveData} from '../lib/live-data.mjs';
import {mergeSnapshot} from '../lib/scoring.mjs';
const at=n=>new Date(n*15000).toISOString(),endpoint='https://cache.workers.dev';
const source=n=>({capturedAt:at(n),tbest:[10],testcaseIds:['p'],teams:[{id:'a',name:'A',latest:[10],submissionId:'s'+n,status:'Pass'}]});
const state=n=>({endpoint,cursor:n,pollCount:n,merged:mergeSnapshot(null,source(n)),source:source(n)});
test('a full history exceeding localStorage quota survives navigation, without a duplicate snapshot',async()=>{
 const indexedDB=new IDBFactory(),first=createSnapshotStore({indexedDB}),big=state(2);big.merged.padding='x'.repeat(6*1024*1024);
 assert.equal(await first.save({state:big,snapshot:{...big.merged,connection:{mode:'live'}},checkedAt:30000}),true);
 const next=await createSnapshotStore({indexedDB}).load();assert.equal(next.snapshot,null);assert.equal(recordSnapshot(next).padding.length,6*1024*1024);assert.equal(recordSnapshot(next).connection.mode,'live');
});
test('an older tab cannot roll back the shared feed cursor or overwrite a newer snapshot',async()=>{
 const indexedDB=new IDBFactory(),a=createSnapshotStore({indexedDB}),b=createSnapshotStore({indexedDB});
 await Promise.all([a.save({state:state(9),checkedAt:1}),b.save({state:state(3),checkedAt:2})]);
 const saved=await a.load();assert.equal(saved.state.cursor,9);assert.equal(recordSnapshot(saved).capturedAt,at(9));
 await b.save({state:state(2),snapshot:mergeSnapshot(null,source(1))});assert.equal((await a.load()).state.cursor,9);
});
test('newer fallback and an unavailable IndexedDB both retain usable in-memory data',async()=>{
 const store=createSnapshotStore({indexedDB:null});assert.equal(await store.save({state:state(1),snapshot:mergeSnapshot(null,source(3))}),false);
 assert.equal(recordSnapshot(await store.load()).capturedAt,at(3));
});
test('migration preserves preferences, page switches use persisted data, manual refresh still checks the server',async()=>{
 const indexedDB=new IDBFactory(),values=new Map([['cann-monitor:cloud-feed',JSON.stringify(state(2))],['cann-monitor:cache',JSON.stringify(state(1).merged)],['cann-monitor:team-prefixes','keep-regions']]);
 const oldStorage=globalThis.localStorage;globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:()=>{throw Error('QuotaExceededError')},removeItem:k=>values.delete(k)};
 const requests=[];let tick=30001;
 const fetcher=async url=>{requests.push(String(url));if(String(url).startsWith('./data-source'))return Response.json({cloudflareEndpoint:endpoint});if(String(url).includes('/api/head'))return Response.json({protocol:1,baseline_url:'https://raw.test',baseline_cursor:0,baseline_poll_count:0,seq:2,poll_count:2,success_at:at(2)});throw Error('History should already be cached')};
 try{
  const a=await liveData({store:createSnapshotStore({indexedDB}),fetcher,now:()=>tick});assert.equal(a.cached.capturedAt,at(2));await a.read();
  assert.equal(values.get('cann-monitor:team-prefixes'),'keep-regions');assert.equal(values.has('cann-monitor:cache'),false);assert.equal(values.has('cann-monitor:cloud-feed'),false);
  requests.length=0;const b=await liveData({store:createSnapshotStore({indexedDB}),fetcher,now:()=>tick});assert.equal(b.cached.capturedAt,at(2));await b.read();assert.deepEqual(requests,[]);
  await b.read({force:true});assert.equal(requests.filter(u=>u.includes('/api/head')).length,1);assert.ok(!requests.some(u=>u.includes('/api/baseline')));
  tick+=15000;await b.read();assert.equal(requests.filter(u=>u.includes('/api/head')).length,2);
 }finally{globalThis.localStorage=oldStorage}
});

test('offline recovery upgrades a stale cache from the website backup without downloading it again on navigation',async()=>{
 const indexedDB=new IDBFactory(),store=createSnapshotStore({indexedDB});await store.save({state:state(2)});let downloads=0;
 const now=()=>1000000,fetcher=async url=>{if(String(url).startsWith('./data/latest')){downloads++;return Response.json(mergeSnapshot(null,source(30)))}throw Error('offline')};
 const a=await liveData({store,fetcher,now});assert.equal((await a.read()).capturedAt,at(30));assert.equal(a.cached.connection.mode,'backup');
 const b=await liveData({store:createSnapshotStore({indexedDB}),fetcher,now});assert.equal(b.cached.capturedAt,at(30));await b.read();assert.equal(downloads,1);
});
