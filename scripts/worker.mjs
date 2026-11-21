import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {intervalSeconds,failureDelaySeconds,nextPollAt} from '../lib/polling.mjs';
const state=resolve('.state'),minutes=Number(process.env.DURATION_MINUTES??4),deadline=Date.now()+minutes*60000,interval=intervalSeconds(process.env.POLL_INTERVAL_SECONDS);
if(process.env.GITHUB_EVENT_NAME==='schedule' && Date.now()>Date.parse('2026-12-05T04:45:00Z')){console.log('Contest ended; scheduled collection stopped. Manual collection remains available.');process.exit(0)}
if(!Number.isFinite(minutes)||minutes<0||minutes>29)throw Error('Invalid worker duration');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{stdio:'inherit',timeout:120000,...options});if(options.stdio==='pipe'){if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr)}if(r.status!==0){const error=Error(`${cmd} exited ${r.status}`);const retry=String(r.stderr??'').match(/retryAfter:\s*(\d+)/);if(retry)error.retryAfter=Number(retry[1]);throw error}}
let success=0,failures=0;
do {
 const cycleStart=Date.now();let next;
 try{
  run(process.execPath,['scripts/collect.mjs'],{env:{...process.env,POLL_INTERVAL_SECONDS:String(interval),OUTPUT_FILE:resolve(state,'latest.json')},stdio:'pipe',encoding:'utf8'});
  run('git',['-C',state,'add','latest.json']);
  run('git',['-C',state,'-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','Update public ranking snapshot']);
  run('git',['-C',state,'push','origin','HEAD:data']);success++;failures=0;
  next=nextPollAt(cycleStart,Date.now(),interval);
 }catch(e){failures++;const delay=failureDelaySeconds(failures,e.retryAfter,interval);console.error('Capture/publish failed; retaining existing history:',e.message,`Retry in ${delay}s`);next=Date.now()+delay*1000}
 if(minutes===0||next>=deadline)break;
 await new Promise(r=>setTimeout(r,Math.max(1,next-Date.now())));
}while(Date.now()<deadline);
if(!success)process.exitCode=1;
