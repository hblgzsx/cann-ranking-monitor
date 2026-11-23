// One shared, structured snapshot across all pages. Preferences remain in localStorage.
export function newerRecord(previous,next){
 previous??={};
 const a=previous.state,b=next.state;
 const state=!a?b:!b?a:a.endpoint!==b.endpoint?b:b.cursor>a.cursor||b.cursor===a.cursor&&b.pollCount>=a.pollCount?b:a;
 const snapshots=[next.snapshot,previous.snapshot,state?.merged].filter(Boolean).sort((x,y)=>Date.parse(y.capturedAt)-Date.parse(x.capturedAt));
 const latest=snapshots[0],covered=state&&Date.parse(state.merged.capturedAt)>=Date.parse(latest?.capturedAt);
 return {state,snapshot:covered?null:latest,connection:latest?.connection??next.connection??previous.connection,checkedAt:Math.max(previous.checkedAt??0,next.checkedAt??0),backupCheckedAt:Math.max(previous.backupCheckedAt??0,next.backupCheckedAt??0)};
}
export const recordSnapshot=record=>{const snapshot=record?.snapshot??record?.state?.merged;return snapshot?{...snapshot,connection:record.connection??snapshot.connection}:null};
export function createSnapshotStore({indexedDB=globalThis.indexedDB}={}){
 let memory=null,opening;
 const open=()=>opening??=new Promise(resolve=>{
  if(!indexedDB){resolve(null);return}
  let settled=false;const done=value=>{if(settled){value?.close();return}settled=true;clearTimeout(timer);resolve(value)},timer=setTimeout(()=>done(null),1500);
  try{const request=indexedDB.open('cann-monitor-snapshots',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>done(request.result);request.onerror=()=>done(null);request.onblocked=()=>done(null)}catch{done(null)}
 });
 async function transaction(mode,action){
  const db=await open();if(!db)return null;
  return new Promise(resolve=>{
   let result=null,settled=false,tx;const done=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value)}},timer=setTimeout(()=>{try{tx?.abort()}catch{}done(null)},2500);
   try{tx=db.transaction('snapshots',mode);tx.oncomplete=()=>done(result);tx.onerror=tx.onabort=()=>done(null);action(tx.objectStore('snapshots'),value=>{result=value})}catch{done(null)}
  });
 }
 return {
  async load(){const stored=await transaction('readonly',(store,set)=>{const request=store.get('latest');request.onsuccess=()=>set(request.result??null)});memory=newerRecord(memory,stored??{});return memory},
  async save(record){memory=newerRecord(memory,record);const persisted=await transaction('readwrite',(store,set)=>{const request=store.get('latest');request.onsuccess=()=>{const next=newerRecord(request.result,memory);store.put(next,'latest');set(true)}});return !!persisted}
 };
}
