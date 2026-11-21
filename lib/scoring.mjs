export const validTime = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
export function parseTime(x) {
 if(typeof x === 'number') return validTime(x) ? x : null;
 const m=String(x??'').trim().match(/^([\d.]+)\s*(ns|[μµu]s|ms|s)$/i);
 const t=m ? Number(m[1])*({ns:.001,us:1,'μs':1,'µs':1,ms:1000,s:1e6}[m[2].toLowerCase()]) : null;
 return validTime(t) ? t : null;
}
export function pointScore(t,T) { return validTime(t)&&validTime(T) ? 100/(1+Math.log(Math.max(1,t/T))/Math.log(1.5)) : 0; }
export function totalScore(times,best) { return best.length ? best.reduce((s,T,i)=>s+pointScore(times?.[i],T),0)/best.length : 0; }
// Migrate old change points without inventing submission IDs or submission dates.
export function observedSubmissions(team,count) {
 const entries=new Map();
 const add=(item)=>{
  if(!Array.isArray(item?.times)||item.times.length!==count)return;
  const times=item.times.map(t=>validTime(t)?t:null);
  const id=String(item.submissionId??'');
  const key=id?'id:'+id:'times:'+JSON.stringify(times);
  const old=entries.get(key);
  // The same submission can be observed while judging and again after completion.
  // Replace its entire vector; never fill failed points from an earlier evaluation.
  entries.set(key,{...old,...item,submissionId:id,times,submittedAt:item.submittedAt??old?.submittedAt??null,observedAt:old?.observedAt??item.observedAt??null});
 };
 for(const s of team.submissions??[])add(s);
 for(const p of team.history??[])add({times:p.latest,submissionId:p.submissionId,submittedAt:p.submittedAt??null,observedAt:p.at});
 add({times:team.latest,submissionId:team.submissionId,submittedAt:team.submittedAt??null,observedAt:team.lastSeen??team.firstSeen??null});
 return [...entries.values()];
}
export function bestHistoricalSubmission(team,tbest) {
 let best=null;
 for(const submission of observedSubmissions(team,tbest.length)){
  const score=totalScore(submission.times,tbest);
  if(!best||score>best.score||(score===best.score&&!best.submissionId&&submission.submissionId))best={...submission,score};
 }
 return best;
}
const sameTime=(a,b)=>validTime(a)&&validTime(b)&&Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*1e-12);
export function resolveTbestOwners(data) {
 const records=(data.teams??[]).map(t=>({team:t,submissions:observedSubmissions(t,data.tbest.length)}));
 return data.tbest.map((T,i)=>{
  const officialId=data.tbestSubmissionIds?.[i];
  const official=officialId?records.filter(r=>r.submissions.some(s=>s.submissionId===officialId&&sameTime(s.times[i],T))):[];
  if(official.length)return {teamIds:official.map(r=>r.team.id),method:'official-submission'};
  const matches=records.filter(r=>sameTime(r.team.historical?.[i],T)||r.submissions.some(s=>sameTime(s.times[i],T)));
  return {teamIds:matches.map(r=>r.team.id),method:matches.length?'observed-match':'unknown'};
 });
}
export function mergeSnapshot(previous,snapshot) {
 if(!snapshot.teams.length || !snapshot.tbest.length || snapshot.tbest.some(t=>!validTime(t))) throw Error('Invalid ranking snapshot');
 if(snapshot.teams.some(t=>t.latest.length!==snapshot.tbest.length)) throw Error('Inconsistent testcase count');
 const now=snapshot.capturedAt, same=previous?.tbest?.length===snapshot.tbest.length && JSON.stringify(previous?.testcaseIds)===JSON.stringify(snapshot.testcaseIds);
 const oldTeams=new Map((same?previous.teams:[]).map(t=>[t.id,t]));
 const teams=snapshot.teams.map(t=>{
  const old=oldTeams.get(t.id);
  // The source normalizer only admits times whose individual testcase passed.
  const historical=snapshot.tbest.map((_,i)=>{const a=[old?.historical?.[i],t.latest[i]].filter(validTime);return a.length?Math.min(...a):null;});
  const history=[...(old?.history??[])], computed=totalScore(historical,snapshot.tbest);
  const p={at:now,computed,official:t.officialScore,tbest:snapshot.tbest,latest:t.latest,submissionId:t.submissionId,submittedAt:t.submittedAt};
  const last=history.at(-1);
  if(!last || last.computed!==computed || last.official!==p.official || JSON.stringify(last.latest)!==JSON.stringify(p.latest) || JSON.stringify(last.tbest)!==JSON.stringify(p.tbest)) history.push(p);
  const submissions=observedSubmissions({...old,latest:t.latest,submissionId:t.submissionId,submittedAt:t.submittedAt,lastSeen:now},snapshot.tbest.length);
  return {...t,historical,submissions,firstSeen:old?.firstSeen??now,lastSeen:now,observations:(old?.observations??0)+1,history:history.slice(-2000)};
 });
 const present=new Set(teams.map(t=>t.id));
 return {schemaVersion:1,problem:'BatchedDiagGmmEm',sourceUrl:'https://cannjudge.cn/public/2026_cann_final/batcheddiaggmmem/ranking',startedAt:same?previous.startedAt:now,capturedAt:now,snapshotCount:same?(previous.snapshotCount??0)+1:1,expectedIntervalSeconds:60,historyScope:'observed-since-start',testcaseIds:snapshot.testcaseIds,tbestSubmissionIds:snapshot.tbestSubmissionIds,tbest:snapshot.tbest,total:snapshot.total,teams:[...teams,...[...oldTeams.values()].filter(t=>!present.has(t.id)).map(t=>({...t,archived:true}))]};
}
