import test from 'node:test';import assert from 'node:assert/strict';
import {createConfiguredFeed,createFeedClient,makePatch} from '../lib/feed.mjs';
import {fetchJSON,cloneJSON} from '../lib/network.mjs';
import {mergeSnapshot} from '../lib/scoring.mjs';
import {liveData} from '../lib/live-data.mjs';
const at=n=>new Date(n*15000).toISOString();
const source=n=>({capturedAt:at(n),tbest:[10],testcaseIds:['c'],teams:[{id:'a',name:'A',latest:[10+n],submissionId:'s'+n,status:'Pass',officialRank:1,officialScore:80}]});
test('JSON networking and replay work without AbortSignal.timeout or structuredClone',async()=>{
 const timeout=AbortSignal.timeout,clone=globalThis.structuredClone;
 try{AbortSignal.timeout=undefined;globalThis.structuredClone=undefined;assert.deepEqual(cloneJSON({a:[1]}),{a:[1]});assert.equal((await fetchJSON('test',{fetcher:async()=>Response.json({ok:true})})).ok,true);
 const feed=createFeedClient('https://collector.test',{fetcher:async url=>Response.json(String(url).includes('/api/head')?{protocol:1,baseline_url:'https://raw.test/file',baseline_cursor:0,baseline_poll_count:0,seq:0,poll_count:0,success_at:at(0)}:mergeSnapshot(null,source(0)))});assert.equal((await feed.read()).teams.length,1);
 }finally{AbortSignal.timeout=timeout;globalThis.structuredClone=clone}
});
test('configuration failure is retried on the next read instead of permanently disabling live connection',async()=>{
 let calls=0;const endpoint='https://sample.workers.dev';
 const feed=createConfiguredFeed({fetcher:async url=>{if(String(url).includes('data-source.json')){calls++;if(calls===1)throw Error('temporary offline');return Response.json({cloudflareEndpoint:endpoint})}return Response.json(String(url).includes('/api/head')?{protocol:1,baseline_url:'https://raw.test/file',baseline_cursor:0,baseline_poll_count:0,seq:0,poll_count:0,success_at:at(0)}:mergeSnapshot(null,source(0)))}});
 await assert.rejects(feed.read());assert.equal((await feed.read()).teams[0].name,'A');assert.equal(calls,2);
});
test('checkpoint proxy avoids browser dependence on GitHub Raw and partial replay resumes after network failure',async()=>{
 let fail=true;const urls=[];let saved;
 const head={protocol:1,baseline_url:'https://raw.test/file',baseline_proxy_url:'https://collector.test/api/baseline?version=v1',baseline_cursor:0,baseline_poll_count:0,baseline_version:'v1',seq:2,poll_count:2,success_at:at(2)};
 const fetcher=async url=>{urls.push(url);if(url.includes('/api/head'))return Response.json(head);if(url.includes('/api/baseline'))return Response.json(mergeSnapshot(null,source(0)));if(url.includes('after=0'))return Response.json({events:[{seq:1,pollCount:1,patch:makePatch(source(0),source(1))}]});if(fail){fail=false;throw Error('offline')}return Response.json({events:[{seq:2,pollCount:2,patch:makePatch(source(1),source(2))}]})};
 const feed=createFeedClient('https://collector.test',{fetcher,save:state=>{saved=state}});await assert.rejects(feed.read());assert.equal(saved.cursor,1);const result=await feed.read();assert.equal(result.teams[0].submissionId,'s2');assert.equal(urls.filter(u=>u.includes('/api/baseline')).length,1);assert.ok(!urls.some(u=>u.startsWith('https://raw.test')));assert.equal(result.teams[0].submissions.length,3);
});
test('a blocked live domain uses the current same-origin snapshot and later retries live mode',async()=>{
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;let online=false;const requests=[],values=new Map();
 const snapshot=mergeSnapshot(null,{...source(0),capturedAt:new Date().toISOString()}),endpoint='https://sample.workers.dev';
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 globalThis.fetch=async url=>{requests.push(String(url));if(String(url).startsWith('./data-source'))return Response.json({cloudflareEndpoint:endpoint});if(String(url).startsWith('./data/latest'))return Response.json(snapshot);if(String(url).includes('/api/head')){if(!online)throw Error('Network failed');return Response.json({protocol:1,baseline_url:'https://raw.test/base',baseline_proxy_url:endpoint+'/api/baseline?version=v1',baseline_cursor:0,baseline_poll_count:0,seq:0,poll_count:0,success_at:snapshot.capturedAt})}if(String(url).includes('/api/baseline'))return Response.json(snapshot);throw Error('Unexpected request')};
 try{const client=await liveData();const fallback=await client.read();assert.equal(fallback.connection.mode,'backup');assert.match(fallback.connection.message,/实时接口/);assert.ok(requests.some(u=>u.startsWith('./data/latest')));assert.ok(!requests.some(u=>u.startsWith('https://raw.')));online=true;assert.equal((await client.read()).connection.mode,'live')}finally{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage}
});
