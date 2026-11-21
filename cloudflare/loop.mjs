import {capture} from './worker.mjs';
import {failureDelaySeconds,nextPollAt} from '../lib/polling.mjs';
export class PersistentLoop {
 constructor(storage,env,{now=()=>Date.now(),sample=()=>capture(env)}={}){this.storage=storage;this.env=env;this.now=now;this.sample=sample;this.running=false}
 enabled(){return this.env.PAUSED!=='true'&&(!this.env.COLLECT_UNTIL||this.now()<Date.parse(this.env.COLLECT_UNTIL))}
 async ensure(){
  if(!this.enabled()||this.running)return {running:this.running};
  const alarm=await this.storage.getAlarm();
  if(alarm===null||alarm<this.now()-60000)await this.storage.setAlarm(this.now()+100);
  return {nextAlarm:await this.storage.getAlarm()};
 }
 async alarm(){
  if(!this.enabled()||this.running)return;
  this.running=true;const start=this.now();
  let target;
  try{
   const anchor=await this.storage.get('anchor')??start;
   // Pre-arm before I/O so an isolate restart cannot silently break the chain.
   await this.storage.put('anchor',anchor);
   await this.storage.setAlarm(nextPollAt(anchor,start));
   const result=await this.sample();target=nextPollAt(anchor,this.now());
   if(result.failed)target=Math.max(target,this.now()+result.delaySeconds*1000);
   await this.storage.put('failures',0);
  }catch(error){const failures=(await this.storage.get('failures')??0)+1;await this.storage.put('failures',failures);target=this.now()+failureDelaySeconds(failures)*1000;console.error(JSON.stringify({event:'scheduler-error',message:String(error.message).slice(0,160)}))}
  finally{try{if(this.enabled())await this.storage.setAlarm(target??this.now()+15000)}finally{this.running=false}}
 }
}
