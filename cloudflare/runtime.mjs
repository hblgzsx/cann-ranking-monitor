import {DurableObject} from 'cloudflare:workers';
import api,{adoptCheckpoint} from './worker.mjs';
import {PersistentLoop} from './loop.mjs';
export class SamplingLoop extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.loop=new PersistentLoop(ctx.storage,env)}
 async ensure(){return this.loop.ensure()}
 async alarm(){return this.loop.alarm()}
}
export default {
 fetch:api.fetch,
 async scheduled(controller,env,ctx){
  await env.SAMPLER.get(env.SAMPLER.idFromName('batcheddiaggmmem')).ensure();
  ctx.waitUntil(adoptCheckpoint(env));
 }
};
