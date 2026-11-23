import {fetchRanking,getJSON} from '../lib/source.mjs';
import {makePatch} from '../lib/feed.mjs';
import {failureDelaySeconds} from '../lib/polling.mjs';
const REPO='hblgzsx/cann-ranking-monitor';
const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
const reply=(value,status=200)=>Response.json(value,{status,headers});
export async function capture(env,{now=()=>Date.now(),request}={}){
 const start=now(),owner=crypto.randomUUID();
 const head=await env.DB.prepare('UPDATE monitor_head SET lease_until=?,lease_owner=?,attempt_at=? WHERE id=1 AND lease_until<=? AND (next_attempt_at<=? OR (failures=0 AND next_attempt_at<=?)) RETURNING *').bind(start+20000,owner,new Date(start).toISOString(),start,start,start+1000).first();
 if(!head)return {skipped:true};
 try{
  const snapshot=await fetchRanking({request:request??(url=>{const remaining=10000-(now()-start);if(remaining<1)throw Error('Source collection exceeded its time budget');return getJSON(url,{attempts:1,timeoutMs:Math.min(8000,remaining)})})});
  snapshot.capturedAt=new Date(now()).toISOString();
  const previous=head.source_json?JSON.parse(head.source_json):null,patch=makePatch(previous,snapshot),count=head.poll_count+1;
  const gap=head.success_at?Math.max(0,(Date.parse(snapshot.capturedAt)-Date.parse(head.success_at))/1000):0;
  const statements=[];
  if(patch)statements.push(env.DB.prepare('INSERT INTO monitor_events(poll_count,at,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM monitor_head WHERE id=1 AND lease_owner=?)').bind(count,snapshot.capturedAt,JSON.stringify(patch),owner));
  if(gap>30)statements.push(env.DB.prepare("INSERT INTO monitor_gaps(at,kind,duration_seconds,message) VALUES(?,'gap',?,'No successful capture during this interval')").bind(snapshot.capturedAt,gap));
  statements.push(env.DB.prepare('UPDATE monitor_head SET seq=COALESCE((SELECT MAX(seq) FROM monitor_events),seq),poll_count=?,source_json=?,success_at=?,next_attempt_at=?,error=NULL,failures=0,lease_until=0,lease_owner=NULL,last_gap_seconds=?,max_gap_seconds=MAX(max_gap_seconds,?) WHERE id=1 AND lease_owner=?').bind(count,JSON.stringify(snapshot),snapshot.capturedAt,start+15000,gap,gap,owner));
  await env.DB.batch(statements);
  console.log(JSON.stringify({event:'captured',at:snapshot.capturedAt,pollCount:count,changed:!!patch,gapSeconds:gap}));
  return {captured:true,changed:!!patch};
 }catch(error){
  const failures=head.failures+1,delay=failureDelaySeconds(failures,error.retryAfter),message=String(error.message).slice(0,240);
  await env.DB.batch([
   env.DB.prepare('UPDATE monitor_head SET error=?,failures=?,next_attempt_at=?,lease_until=0,lease_owner=NULL WHERE id=1 AND lease_owner=?').bind(message,failures,now()+delay*1000,owner),
   env.DB.prepare("INSERT INTO monitor_gaps(at,kind,message) VALUES(?,'error',?)").bind(new Date(now()).toISOString(),message)
  ]);
  console.error(JSON.stringify({event:'capture-failed',message,delaySeconds:delay}));return {failed:true,delaySeconds:delay};
 }
}
// A repository-owned, immutable Git commit is the authority for a compacted backup.
// No GitHub write token or public mutation endpoint is needed in this Worker.
export async function adoptCheckpoint(env){
 const now=Date.now(),head=await env.DB.prepare('UPDATE monitor_head SET checkpoint_checked_at=? WHERE id=1 AND checkpoint_checked_at<? RETURNING baseline_version,baseline_cursor,seq,poll_count').bind(now,now-3600000).first();
 if(!head)return;
 try{
  const manifest=await getJSON(`https://raw.githubusercontent.com/${REPO}/data/cloud-checkpoint.json?t=${now}`,{attempts:1,timeoutMs:8000});
  const sha=manifest.commit;if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Checkpoint has not been sealed with an immutable commit');
  const root=`https://raw.githubusercontent.com/${REPO}/${sha}/`;
  if(manifest.parentVersion!==head.baseline_version||manifest.cursor<head.baseline_cursor||manifest.cursor>head.seq||manifest.pollCount>head.poll_count||manifest.version===head.baseline_version)return;
  if(!Number.isSafeInteger(manifest.cursor)||!Number.isSafeInteger(manifest.pollCount)||!/^[a-zA-Z0-9-]{1,80}$/.test(manifest.version))throw Error('Invalid checkpoint manifest');
  const file=await fetch(root+'latest.json',{method:'HEAD'});if(!file.ok)throw Error('Checkpoint file is unavailable');
  await env.DB.batch([
   env.DB.prepare('UPDATE monitor_head SET baseline_version=?,baseline_url=?,baseline_cursor=?,baseline_poll_count=? WHERE id=1 AND baseline_version=?').bind(manifest.version,root+'latest.json',manifest.cursor,manifest.pollCount,head.baseline_version),
   env.DB.prepare('DELETE FROM monitor_events WHERE seq<=? AND EXISTS(SELECT 1 FROM monitor_head WHERE id=1 AND baseline_version=?)').bind(manifest.cursor,manifest.version),
   env.DB.prepare("DELETE FROM monitor_gaps WHERE at<datetime('now','-30 days')")
  ]);
  console.log(JSON.stringify({event:'checkpoint-adopted',cursor:manifest.cursor,version:manifest.version}));
 }catch(error){console.log(JSON.stringify({event:'checkpoint-not-adopted',message:String(error.message).slice(0,160)}))}
}
export default {
 async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return reply({error:'Read-only API'},405);
  const url=new URL(request.url);
  try{
   if(url.pathname==='/api/head'){
    const head=await env.DB.prepare('SELECT baseline_version,baseline_url,baseline_cursor,baseline_poll_count,seq,poll_count,success_at,attempt_at,next_attempt_at,error,failures,last_gap_seconds,max_gap_seconds FROM monitor_head WHERE id=1').first();
    return head?reply({protocol:1,intervalSeconds:15,...head,baseline_proxy_url:url.origin+'/api/baseline?version='+encodeURIComponent(head.baseline_version)}):reply({error:'Collector is not initialized'},503);
   }
   if(url.pathname==='/api/baseline'){
    const head=await env.DB.prepare('SELECT baseline_url,baseline_version FROM monitor_head WHERE id=1').first();
    if(!head)return reply({error:'Collector is not initialized'},503);
    if(url.searchParams.get('version')!==head.baseline_version)return reply({error:'Checkpoint changed; retry head'},409);
    if(!/^https:\/\/raw\.githubusercontent\.com\/hblgzsx\/cann-ranking-monitor\/[a-f0-9]{40}\/latest\.json$/.test(head.baseline_url))return reply({error:'Invalid checkpoint source'},503);
    const cache=globalThis.caches?.default,cacheKey=new Request(head.baseline_url),cached=cache&&await cache.match(cacheKey);
    if(cached)return cached;
    const upstream=await fetch(head.baseline_url,{signal:AbortSignal.timeout(12000)});if(!upstream.ok)return reply({error:'Checkpoint temporarily unavailable'},502);
    const response=new Response(upstream.body,{headers:{...headers,'Cache-Control':'public, max-age=300'}});
    if(cache)await cache.put(cacheKey,response.clone());return response;
   }
   if(url.pathname==='/api/events'){
    const after=Number(url.searchParams.get('after')??0),through=Number(url.searchParams.get('through')??Number.MAX_SAFE_INTEGER);
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(through)||through<after)return reply({error:'Invalid cursor'},400);
    const {results}=await env.DB.prepare('SELECT seq,poll_count,payload FROM monitor_events WHERE seq>? AND seq<=? ORDER BY seq LIMIT 30').bind(after,through).all();
    return new Response('{"events":['+results.map(row=>`{"seq":${row.seq},"pollCount":${row.poll_count},"patch":${row.payload}}`).join(',')+']}',{headers});
   }
   if(url.pathname==='/api/gaps'){const {results}=await env.DB.prepare('SELECT at,kind,duration_seconds,message FROM monitor_gaps ORDER BY id DESC LIMIT 100').all();return reply({gaps:results})}
   return reply({service:'CANN public ranking collector',intervalSeconds:15,endpoints:['/api/head','/api/events','/api/gaps']});
  }catch(error){console.error('Read failed:',String(error.message));return reply({error:'Collector storage is temporarily unavailable'},503)}
 }
};
