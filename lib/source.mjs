import {validTime} from './scoring.mjs?v=20261124-cases';
import {retryAfterSeconds} from './polling.mjs';
export const SOURCE='https://cannjudge.cn';
export const PROBLEM_ID='6afffa9785ad43bbe02307b6';
export function normalizeRanking(payload,capturedAt=new Date().toISOString()) {
 const cases=payload.testcases?.filter(c=>!c.unavailable);
 if(!cases?.length || cases.some(c=>c.ranking_excluded || c.hidden || c.type==='functional')) throw Error('Unsupported or unavailable testcases; preserving last valid snapshot');
 const ids=cases.map(c=>String(c._id??c.id??''));if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw Error('Missing or duplicate testcase identity');
 const rows=payload.rows??payload.list;
 if(!Array.isArray(rows)||!rows.length)throw Error('Ranking is empty or hidden');
 const teams=rows.map((r,index)=>{
  const results=new Map((r.result??[]).map(p=>[String(p.testcase_id),p]));
  const user=r.submitter??r.user??{};
  const id=String(r.team?._id??r.team?.team_id??r.user_id??'');
  if(!id)throw Error('Missing stable team identity');
  const latestAssessed=cases.map(c=>{const p=results.get(String(c._id??c.id));return !!p&&/^(pass|wrong answer|runtime error|compile error|time limit exceeded|memory limit exceeded|output limit exceeded|failed|error)$/i.test(p.testcase_status??'')});
  return {id,name:String(r.team?.team_name??r.team?.name??user.nickname??id),submitter:String(user.group_nickname||user.nickname||'—'),officialRank:Number(r.rank??index+1),officialScore:Number(r.score)||0,status:String(r.status??r.submission?.status??'Unknown'),submittedAt:r.create_time??r.submission?.create_time??null,submissionId:String(r.submission_id??r.submission?._id??''),latestAssessed,latest:cases.map(c=>{const p=results.get(String(c._id??c.id));return /^pass$/i.test(p?.testcase_status)&&validTime(p.time)?p.time:null})};
 });
 if(new Set(teams.map(t=>t.id)).size!==teams.length)throw Error('Duplicate team identity');
 return {capturedAt,tbest:cases.map(c=>validTime(c.tbest)?c.tbest:null),tbestSubmissionIds:cases.map(c=>String(c.tbest_submission_id??'')),testcaseIds:ids,total:Number(payload.total??teams.length),teams};
}
export async function getJSON(url,{attempts=3,timeoutMs=20000}={}) {
 let last;
 for(let attempt=0;attempt<attempts;attempt++) {
  try {const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'CANN-Monitor/1.0 (public ranking observer; https://github.com/hblgzsx/cann-ranking-monitor)'},signal:AbortSignal.timeout(timeoutMs)});if(!response.ok){const error=Error(`Source HTTP ${response.status}`);error.status=response.status;error.retryAfter=retryAfterSeconds(response.headers.get('Retry-After'));throw error}return await response.json()}catch(e){last=e;if(e.status===429||e.retryAfter!==null&&e.retryAfter!==undefined)throw e;if(attempt<attempts-1)await new Promise(r=>setTimeout(r,1000*(attempt+1)))}
 }
 throw last;
}
export async function fetchRanking({request=getJSON}={}){
 const endpoint=`${SOURCE}/api/problems/${PROBLEM_ID}/ranking`;
 const first=await request(`${endpoint}?page=1&size=50`),rows=[...(first.rows??first.list??[])];
 const pages=Number(first.pages??1);
 if(!Number.isInteger(pages)||pages<1||pages>100)throw Error('Invalid pagination');
 for(let page=2;page<=pages;page++){
  const next=await request(`${endpoint}?page=${page}&size=50`);
  if(JSON.stringify(next.testcases)!==JSON.stringify(first.testcases)||next.total!==first.total)throw Error('Source changed during pagination; retry next cycle');
  rows.push(...(next.rows??next.list??[]));
 }
 if(rows.length!==Number(first.total))throw Error(`Incomplete ranking: ${rows.length}/${first.total}`);
 return normalizeRanking({...first,rows});
}
