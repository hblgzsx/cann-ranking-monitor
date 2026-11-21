export const DEFAULT_INTERVAL_SECONDS=15;
export function intervalSeconds(value=DEFAULT_INTERVAL_SECONDS){const n=Number(value);if(!Number.isInteger(n)||n<15||n>900)throw Error('Polling interval must be an integer between 15 and 900 seconds');return n}
export function retryAfterSeconds(value,now=Date.now()){
 if(value==null||String(value).trim()==='')return null;
 const numeric=Number(value),seconds=Number.isFinite(numeric)?numeric:(Date.parse(value)-now)/1000;
 return Number.isFinite(seconds)?Math.max(0,Math.ceil(seconds)):null;
}
export function failureDelaySeconds(failures,retryAfter=null,interval=DEFAULT_INTERVAL_SECONDS){return Math.max(interval,Math.min(900,interval*2**Math.min(Math.max(0,failures-1),6)),Number.isFinite(retryAfter)?Math.max(0,retryAfter):0)}
export function nextPollAt(start,finished,interval=DEFAULT_INTERVAL_SECONDS){const step=interval*1000;return start+Math.max(1,Math.floor((finished-start)/step)+1)*step}
