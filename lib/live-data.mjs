import {createConfiguredFeed} from './feed.mjs?v=20261124-cases';
import {applyResultValidity} from './result-validity.mjs?v=20261127-validity';
import {applyManualSubmissions} from './manual-submissions.mjs?v=20261126-owner';
import {fetchJSON} from './network.mjs';
import {createSnapshotStore,recordSnapshot,newerRecord} from './snapshot-store.mjs';
export const cache={get(key,fallback=null){try{return JSON.parse(localStorage.getItem('cann-monitor:'+key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem('cann-monitor:'+key,JSON.stringify(value))}catch{}}};
const valid=data=>data?.schemaVersion===1&&data.teams?.length&&data.tbest?.length;
export async function liveData({store=createSnapshotStore(),fetcher=fetch,now=()=>Date.now()}={}){
 let record=await store.load()??{},state=record.state??cache.get('cloud-feed'),snapshot=recordSnapshot(record)??cache.get('cache'),checkedAt=record.checkedAt??0,backupCheckedAt=record.backupCheckedAt??0,inflight=null;
 if(!valid(snapshot))snapshot=null;
 if(state?.merged&&!valid(state.merged))state=null;
 if(state?.merged&&(!snapshot||Date.parse(state.merged.capturedAt)>Date.parse(snapshot.capturedAt)))snapshot=state.merged;
 snapshot=applyResultValidity(applyManualSubmissions(snapshot));
 const persist=async()=>{record=newerRecord(record,{state,snapshot,checkedAt,backupCheckedAt});if(await store.save(record))try{localStorage.removeItem('cann-monitor:cloud-feed');localStorage.removeItem('cann-monitor:cache')}catch{}};
 if(!record.state&&!record.snapshot&&(state||snapshot))await persist();
 let saving=Promise.resolve();const save=next=>{state=next;saving=saving.catch(()=>{}).then(persist)};
 const feed=createConfiguredFeed({fetcher,getCache:()=>state,save,loadSeed:()=>fetchJSON('./data/latest.json',{fetcher,timeoutMs:8000})});
 const client={cached:snapshot,async read({force=false}={}){
  if(inflight)return inflight;
  // Navigation reuses a recent sync instead of downloading the same history again.
  if(!force&&snapshot&&snapshot.connection?.mode==='live'&&checkedAt>0&&now()>=checkedAt&&now()-checkedAt<12000&&now()-Date.parse(snapshot.capturedAt)<30000)return snapshot;
  inflight=(async()=>{
   let candidate,error;try{candidate=await feed.read()}catch(e){error=e}
   if(!candidate){
    // Saved full history is immediately usable offline; do not download large backups every poll.
    candidate=snapshot;
    if(!snapshot||now()-Date.parse(snapshot.capturedAt)>90000&&now()-backupCheckedAt>60000){
     backupCheckedAt=now();try{const next=await fetchJSON('./data/latest.json',{fetcher,timeoutMs:6000});if(valid(next)&&(!candidate||Date.parse(next.capturedAt)>Date.parse(candidate.capturedAt)))candidate=next}catch{}
    }
   }
   if(!candidate)throw error??Error('Data unavailable');
   if(snapshot&&Date.parse(snapshot.capturedAt)>Date.parse(candidate.capturedAt))candidate=snapshot;
   candidate={...applyResultValidity(applyManualSubmissions(candidate)),connection:{mode:error?'backup':'live',message:error?error.message:null}};
   snapshot=candidate;client.cached=candidate;if(!error)checkedAt=now();
   await saving;await persist();return candidate;
  })().finally(()=>{inflight=null});return inflight;
 }};
 return client;
}
