import {readFile,writeFile,mkdir} from 'node:fs/promises';
const sha=process.argv[2];if(!/^[0-9a-f]{40}$/.test(sha??''))throw Error('Pass a verified data branch commit SHA');
const url=`https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/${sha}/latest.json`;
let baseline;
if(process.argv[3])baseline=JSON.parse(await readFile(process.argv[3],'utf8'));
else {const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Cannot verify immutable baseline');baseline=await response.json()}
if(baseline.schemaVersion!==1||!baseline.teams?.length||!baseline.tbest?.length)throw Error('Invalid baseline');
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/cloud-seed.sql',`INSERT OR IGNORE INTO monitor_head(id,baseline_version,baseline_url) VALUES(1,'initial','${url}');\n`);
console.log(`Verified existing history: ${baseline.teams.length} teams, ${baseline.snapshotCount} snapshots, started ${baseline.startedAt}, latest ${baseline.capturedAt}.`);
