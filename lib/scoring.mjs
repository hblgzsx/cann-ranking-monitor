export const validTime = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
export function parseTime(x) {
 if(typeof x === 'number') return validTime(x) ? x : null;
 const m=String(x??'').trim().match(/^([\d.]+)\s*(ns|[μµu]s|ms|s)$/i);
 const t=m ? Number(m[1])*({ns:.001,us:1,'μs':1,'µs':1,ms:1000,s:1e6}[m[2].toLowerCase()]) : null;
 return validTime(t) ? t : null;
}
export function pointScore(t,T) { return validTime(t)&&validTime(T) ? 100/(1+Math.log(Math.max(1,t/T))/Math.log(1.5)) : 0; }
export function totalScore(times,best) { return best.length ? best.reduce((s,T,i)=>s+pointScore(times?.[i],T),0)/best.length : 0; }
export function currentBenchmarks(teams,count) {
 const active=teams.filter(t=>!t.archived);
 return Array.from({length:count},(_,i)=>{
  const values=active.map(t=>t.latest?.[i]).filter(validTime);
  const time=values.length?Math.min(...values):null;
  return {time,teamIds:time===null?[]:active.filter(t=>t.latest?.[i]===time).map(t=>t.id)};
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
  const p={at:now,computed,official:t.officialScore,tbest:snapshot.tbest,latest:t.latest};
  const last=history.at(-1);
  if(!last || last.computed!==computed || last.official!==p.official || JSON.stringify(last.latest)!==JSON.stringify(p.latest) || JSON.stringify(last.tbest)!==JSON.stringify(p.tbest)) history.push(p);
  return {...t,historical,firstSeen:old?.firstSeen??now,lastSeen:now,observations:(old?.observations??0)+1,history:history.slice(-2000)};
 });
 const present=new Set(teams.map(t=>t.id));
 return {schemaVersion:1,problem:'BatchedDiagGmmEm',sourceUrl:'https://cannjudge.cn/public/2026_cann_final/batcheddiaggmmem/ranking',startedAt:same?previous.startedAt:now,capturedAt:now,snapshotCount:same?(previous.snapshotCount??0)+1:1,expectedIntervalSeconds:60,historyScope:'observed-since-start',testcaseIds:snapshot.testcaseIds,tbest:snapshot.tbest,total:snapshot.total,teams:[...teams,...[...oldTeams.values()].filter(t=>!present.has(t.id)).map(t=>({...t,archived:true}))]};
}
