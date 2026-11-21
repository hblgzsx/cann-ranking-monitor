import {mergeSnapshot} from './scoring.mjs';
import {snapshotChanges,hasChanges} from './analytics.mjs';
export function sourceFromState(state){
 return {capturedAt:state.capturedAt,tbest:state.tbest,testcaseIds:state.testcaseIds,tbestSubmissionIds:state.tbestSubmissionIds??[],total:state.total,teams:state.teams.filter(t=>!t.archived).map(({id,name,submitter,officialRank,officialScore,status,submittedAt,submissionId,latest})=>({id,name,submitter,officialRank,officialScore,status,submittedAt,submissionId,latest}))};
}
export function makePatch(previous,current){
 const old=new Map((previous?.teams??[]).map(t=>[t.id,JSON.stringify(t)]));
 const changed=current.teams.filter(t=>old.get(t.id)!==JSON.stringify(t));
 const sameMeta=previous&&['tbest','testcaseIds','tbestSubmissionIds','total'].every(key=>JSON.stringify(previous[key])===JSON.stringify(current[key]));
 const present=current.teams.map(t=>t.id),sameIds=previous&&JSON.stringify(previous.teams.map(t=>t.id))===JSON.stringify(present);
 if(sameMeta&&sameIds&&!changed.length)return null;
 return {...current,teams:changed,presentIds:present};
}
export function applyPatch(previous,patch){
 const teams=new Map((previous?.teams??[]).map(t=>[t.id,t]));
 for(const t of patch.teams)teams.set(t.id,t);
 const present=patch.presentIds.map(id=>teams.get(id));
 if(present.some(t=>!t))throw Error('Incomplete cloud feed; reload checkpoint');
 const {presentIds,...snapshot}=patch;return {...snapshot,teams:present};
}
function advance(state,pollCount,at){
 const delta=pollCount-state.pollCount;if(delta<0)throw Error('Cloud poll counter moved backwards');
 const ids=new Set(state.source.teams.map(t=>t.id));
 return {...state,pollCount,merged:{...state.merged,capturedAt:at,snapshotCount:(state.merged.snapshotCount??0)+delta,expectedIntervalSeconds:15,teams:state.merged.teams.map(t=>ids.has(t.id)?{...t,lastSeen:at,observations:(t.observations??0)+delta}:t)}};
}
export function replayEvent(state,event){
 if(event.seq<=state.cursor)return state;
 const source=applyPatch(state.source,event.patch),before=advance(state,event.pollCount-1,event.patch.capturedAt),merged=mergeSnapshot(before.merged,source),changes=snapshotChanges(before.merged,merged);
 merged.expectedIntervalSeconds=15;merged.changes=changes===null?null:hasChanges(changes)?changes:before.merged.changes??changes;
 return {...state,source,merged,pollCount:event.pollCount,cursor:event.seq};
}
export function createFeedClient(endpoint,{fetcher=fetch,cache=null,save=()=>{}}={}){
 let state=cache;
 const json=async url=>{let last;for(let attempt=0;attempt<2;attempt++){try{const res=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!res.ok){const error=Error('Cloud feed HTTP '+res.status);error.status=res.status;throw error}return await res.json()}catch(error){last=error;if(error.status===429||error.status&&error.status<500)throw error;if(!attempt)await new Promise(resolve=>setTimeout(resolve,500))}}throw last};
 return {async read(){
  const head=await json(endpoint+'/api/head?t='+Date.now());
  if(head.protocol!==1||!head.baseline_url||!Number.isSafeInteger(head.seq))throw Error('Invalid cloud feed head');
  if(!state||state.endpoint!==endpoint||state.cursor<head.baseline_cursor||state.cursor>head.seq){
   const baseline=await json(head.baseline_url),metadata=baseline._cloudFeed;
   if(baseline.schemaVersion!==1||!baseline.teams?.length)throw Error('Invalid history checkpoint');
   if(head.baseline_cursor>0&&(!metadata||metadata.cursor!==head.baseline_cursor||metadata.pollCount!==head.baseline_poll_count))throw Error('Checkpoint manifest mismatch');
   const {_cloudFeed,...merged}=baseline;
   state={endpoint,cursor:head.baseline_cursor,pollCount:head.baseline_poll_count,source:metadata?.source??sourceFromState(merged),merged};
  }
  let next=structuredClone(state);
  while(next.cursor<head.seq){
   const page=await json(`${endpoint}/api/events?after=${next.cursor}&through=${head.seq}`);
   if(!page.events?.length)throw Error('Cloud history gap; retaining previous data');
   for(const event of page.events){if(!Number.isSafeInteger(event.seq)||event.seq<=next.cursor||event.seq>head.seq)throw Error('Event outside captured cursor range');next=replayEvent(next,event)}
  }
  if(head.success_at)next=advance(next,head.poll_count,head.success_at);
  next.version=head.baseline_version;
  next.merged.collector={provider:'cloudflare',intervalSeconds:15,lastSuccessAt:head.success_at,lastAttemptAt:head.attempt_at,nextAttemptAt:head.next_attempt_at,lastError:head.error,lastGapSeconds:head.last_gap_seconds,maxGapSeconds:head.max_gap_seconds};
  state=next;save(state);return state.merged;
 },checkpoint(){if(!state)throw Error('Feed has not been read');return {...state.merged,_cloudFeed:{cursor:state.cursor,pollCount:state.pollCount,baselineVersion:state.version,source:state.source}}}};
}
