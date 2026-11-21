import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha??''))throw Error('Invalid backup commit');
const file=resolve(process.env.BACKUP_DIR??'.state','cloud-checkpoint.json'),manifest=JSON.parse(await readFile(file,'utf8'));
await writeFile(file,JSON.stringify({...manifest,commit:sha}));
console.log(`Sealed backup cursor ${manifest.cursor} at immutable Git commit ${sha}.`);
