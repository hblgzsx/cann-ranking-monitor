import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const state=resolve('.state'),minutes=Number(process.env.DURATION_MINUTES??28),deadline=Date.now()+minutes*60000;
if(process.env.GITHUB_EVENT_NAME==='schedule' && Date.now()>Date.parse('2026-12-05T04:45:00Z')){console.log('Contest ended; scheduled collection stopped. Manual collection remains available.');process.exit(0)}
if(!Number.isFinite(minutes)||minutes<0||minutes>29)throw Error('Invalid worker duration');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{stdio:'inherit',...options});if(r.status!==0)throw Error(`${cmd} exited ${r.status}`)}
let success=0;
do {
 const cycleStart=Date.now();
 try{
  run(process.execPath,['scripts/collect.mjs'],{env:{...process.env,OUTPUT_FILE:resolve(state,'latest.json')}});
  run('git',['-C',state,'add','latest.json']);
  run('git',['-C',state,'-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','Update public ranking snapshot']);
  run('git',['-C',state,'push','origin','HEAD:data']);success++;
 }catch(e){console.error('Capture/publish failed; retaining existing history:',e.message)}
 if(Date.now()+60000>=deadline)break;
 await new Promise(r=>setTimeout(r,Math.max(1000,60000-(Date.now()-cycleStart))));
}while(Date.now()<deadline);
if(!success)process.exitCode=1;
