import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fetchRanking} from '../lib/source.mjs';
import {mergeSnapshot} from '../lib/scoring.mjs';
import {snapshotChanges,hasChanges} from '../lib/analytics.mjs';
const output=resolve(process.env.OUTPUT_FILE??'data/latest.json');
let previous=null;
try{previous=JSON.parse(await readFile(output,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('Previous history is corrupt; refusing to reset: '+e.message)}
const snapshot=await fetchRanking();
const merged=mergeSnapshot(previous,snapshot);
const changes=snapshotChanges(previous,merged);
merged.changes=changes===null?null:hasChanges(changes)?changes:previous?.changes??changes;
await mkdir(dirname(output),{recursive:true});
await writeFile(output+'.new',JSON.stringify(merged));
await rename(output+'.new',output);
console.log(`Captured ${merged.teams.filter(t=>!t.archived).length} teams, ${merged.tbest.length} testcases at ${merged.capturedAt}. Snapshot ${merged.snapshotCount}.`);
