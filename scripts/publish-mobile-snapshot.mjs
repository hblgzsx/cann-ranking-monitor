import {readFile,writeFile} from 'node:fs/promises';
import {createFeedClient} from '../lib/feed.mjs';
const config=JSON.parse(await readFile('data-source.json','utf8'));
const data=await createFeedClient(config.cloudflareEndpoint).read();
if(Date.now()-Date.parse(data.capturedAt)>15*60000)throw Error('Cloud snapshot is stale; preserving existing published backup');
data.connection={mode:'backup',message:'本站部署时的备用快照，实时通道不可用；以快照采集时间为准'};
await writeFile('_site/data/latest.json',JSON.stringify(data));
console.log('Prepared same-origin mobile fallback: '+data.capturedAt);
