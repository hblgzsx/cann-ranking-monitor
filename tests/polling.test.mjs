import test from 'node:test';
import assert from 'node:assert/strict';
import {intervalSeconds,retryAfterSeconds,failureDelaySeconds,nextPollAt} from '../lib/polling.mjs';
import {getJSON} from '../lib/source.mjs';
test('15-second cadence skips elapsed slots instead of bursting requests',()=>{assert.equal(intervalSeconds(),15);assert.equal(nextPollAt(0,2500),15000);assert.equal(nextPollAt(0,17000),30000);assert.equal(nextPollAt(0,75000),90000);assert.throws(()=>intervalSeconds(1));assert.throws(()=>intervalSeconds('bad'))});
test('backoff honors Retry-After, grows on errors and respects normal cadence',()=>{assert.equal(retryAfterSeconds('120'),120);assert.equal(retryAfterSeconds('Thu, 01 Jan 1970 00:02:00 GMT',0),120);assert.equal(retryAfterSeconds('bad'),null);assert.equal(failureDelaySeconds(1),15);assert.equal(failureDelaySeconds(3),60);assert.equal(failureDelaySeconds(10),900);assert.equal(failureDelaySeconds(1,1800),1800)});
test('source rate limiting is propagated without an immediate retry',async()=>{const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}})};try{await assert.rejects(()=>getJSON('https://example.test'),e=>e.status===429&&e.retryAfter===120);assert.equal(calls,1)}finally{globalThis.fetch=old}});
