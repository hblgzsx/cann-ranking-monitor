import {createConfiguredFeed} from './feed.mjs?v=20261122-mobile';
import {fetchJSON} from './network.mjs';
export const cache={get(key,fallback=null){try{return JSON.parse(localStorage.getItem('cann-monitor:'+key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem('cann-monitor:'+key,JSON.stringify(value))}catch{}}};
export async function liveData(){
 const feed=createConfiguredFeed({getCache:()=>cache.get('cloud-feed'),save:state=>cache.set('cloud-feed',state)});
 return {cached:cache.get('cache'),async read(){
  let candidate,error;try{candidate=await feed.read()}catch(e){error=e}
  if(!candidate)for(const url of ['./data/latest.json','https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/data/latest.json'])try{
   const next=await fetchJSON(url+'?t='+Date.now(),{timeoutMs:8000});if(next.schemaVersion!==1||!next.teams?.length||!next.tbest?.length)throw Error('Invalid snapshot');
   if(!candidate||Date.parse(next.capturedAt)>Date.parse(candidate.capturedAt))candidate=next;
   if(Date.now()-Date.parse(candidate.capturedAt)<15*60000)break;
  }catch{}
  if(!candidate)throw error??Error('Data unavailable');
  candidate={...candidate,connection:{mode:error?'backup':'live',message:error?error.message:null}};
  const previous=cache.get('cache');if(!previous||Date.parse(candidate.capturedAt)>=Date.parse(previous.capturedAt))cache.set('cache',candidate);return candidate;
 }};
}
