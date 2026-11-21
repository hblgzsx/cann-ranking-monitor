import {recoverTbestHistory} from './tbest-history.mjs';
import {observedSubmissions,bestHistoricalSubmission,totalScore} from './scoring.mjs';
export function tbestChangeText(event){
 const team=event.owner.teams.map(t=>t.name).join(' / '),verified=event.owner.method==='official-id';
 const actor=team?(verified?team:team+'（耗时匹配）'):'队伍未确认';
 const movement=event.direction==='faster'?`降低 ${Math.abs(event.changePct).toFixed(2)}%`:event.direction==='slower'?`回退 ${Math.abs(event.changePct).toFixed(2)}%`:'同耗时归属变化';
 return `点${event.index+1} ${actor} · ${movement}`;
}
export function tbestReport(data,{from=null,caseIndex=null,direction='all'}={}){
 const history=recoverTbestHistory(data),all=[],identity=new Map(),observations=[];
 for(const team of data.teams??[])for(const s of observedSubmissions(team,data.tbest.length)){observations.push({team,times:s.times,at:s.observedAt});if(s.submissionId){const entries=identity.get(s.submissionId)??[];entries.push({team,times:s.times});identity.set(s.submissionId,entries)}}
 const owner=(entry,index)=>{
  const id=entry?.submissionIds?.[index]??'';
  const confirmed=(identity.get(id)??[]).filter(r=>r.times[index]===entry.tbest[index]);
  const matches=confirmed.length?confirmed:observations.filter(r=>r.times[index]===entry.tbest[index]&&Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=Date.parse(entry.at));
  return {id,teams:[...new Map(matches.map(r=>[r.team.id,{id:r.team.id,name:r.team.name}])).values()],method:confirmed.length?'official-id':matches.length?'observed-match':id?'unmatched-id':'unknown'};
 };
 for(let h=1;h<history.length;h++){
  const previous=history[h-1],current=history[h];
  for(let index=0;index<data.tbest.length;index++){
   const before=previous.tbest[index],after=current.tbest[index],changed=before!==after,oldId=previous.submissionIds[index]??'',newId=current.submissionIds[index]??'';
   if(!changed&&(!newId||!oldId||oldId===newId))continue;
   all.push({key:h+':'+index,historyIndex:h,index,at:current.at,before,after,changePct:(after/before-1)*100,direction:changed?(after<before?'faster':'slower'):'owner',previous,current,owner:owner(current,index)});
  }
 }
 const inRange=e=>from===null||Date.parse(e.at)>=from;
 const range=all.filter(inRange),events=range.filter(e=>(caseIndex===null||e.index===caseIndex)&&(direction==='all'||e.direction===direction));
 const anchor=from===null?history[0]:[...history].reverse().find(p=>Date.parse(p.at)<=from)??history[0];
 const start=anchor??{at:data.capturedAt,tbest:data.tbest,submissionIds:data.tbestSubmissionIds??[]},last=history.at(-1)??start;
 const visibleHistory=history.filter(p=>p===anchor||from===null||Date.parse(p.at)>=from);
 const cases=data.tbest.map((value,index)=>{const own=range.filter(e=>e.index===index),timed=own.filter(e=>e.direction!=='owner');return {index,current:value,start:start.tbest[index],minimum:history.reduce((min,h)=>Math.min(min,h.tbest[index]),value),netPct:(value/start.tbest[index]-1)*100,faster:own.filter(e=>e.direction==='faster').length,slower:own.filter(e=>e.direction==='slower').length,owners:owner({...last,at:data.capturedAt},index),lastChange:timed.at(-1)?.at??null}});
 return {history,visibleHistory,events,range,cases,start,last,changeCount:range.filter(e=>e.direction!=='owner').length,batchCount:new Set(range.filter(e=>e.direction!=='owner').map(e=>e.at)).size,faster:range.filter(e=>e.direction==='faster').length,slower:range.filter(e=>e.direction==='slower').length,ownerChanges:range.filter(e=>e.direction==='owner').length,lastChange:range.filter(e=>e.direction!=='owner').at(-1)?.at??null};
}
export function referenceImpact(data,teamId,event){
 const team=data.teams.find(t=>t.id===teamId),submission=team&&bestHistoricalSubmission(team,data.tbest);if(!submission||!event)return null;
 const before=totalScore(submission.times,event.previous.tbest),after=totalScore(submission.times,event.current.tbest);
 return {team,submission,before,after,delta:after-before};
}
