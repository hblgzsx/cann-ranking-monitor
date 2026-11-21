import {totalScore,pointScore,bestHistoricalSubmission,validTime} from './scoring.mjs';
import {submissionRecords,statusGroup,beijingDay} from './submissions.mjs';
export function buildTeamReport(data,teamId,opponentId='',day=beijingDay()){
 const team=data.teams.find(t=>t.id===teamId);if(!team)throw Error('Unknown team');
 const ranked=data.teams.filter(t=>!t.archived).map(t=>({team:t,best:bestHistoricalSubmission(t,data.tbest)})).sort((a,b)=>(b.best?.score??0)-(a.best?.score??0)||a.team.officialRank-b.team.officialRank);
 const index=ranked.findIndex(r=>r.team.id===teamId),best=bestHistoricalSubmission(team,data.tbest),times=best?.times??data.tbest.map(()=>null),combo=totalScore(team.historical,data.tbest);
 const opponent=ranked.find(r=>r.team.id===opponentId&&r.team.id!==teamId)??ranked[index===0?1:Math.max(0,index-1)]??null;
 const comparison=opponent?.team.id!==teamId?opponent:null;
 const ownRecords=submissionRecords({...data,teams:[team]}),identified=ownRecords.filter(r=>r.submissionId),today=identified.filter(r=>r.timeBasis==='submitted'&&beijingDay(r.submittedAt)===day);
 const groups={pass:0,failed:0,pending:0,unknown:0};for(const r of identified)groups[statusGroup(r.status)]++;
 const points=data.tbest.map((T,i)=>{const score=pointScore(times[i],T),opponentTime=comparison?.best?.times?.[i]??null,opponentScore=pointScore(opponentTime,T);return {index:i,time:times[i],T,score,ratio:validTime(times[i])?times[i]/T:null,loss:(100-score)/data.tbest.length,opponentTime,opponentScore,contribution:comparison?(score-opponentScore)/data.tbest.length:null}});
 const weakest=[...points].sort((a,b)=>b.loss-a.loss||a.index-b.index),completed=groups.pass+groups.failed;
 const chronology=ownRecords.filter(r=>r.eventAt).sort((a,b)=>Date.parse(a.eventAt)-Date.parse(b.eventAt)||a.key.localeCompare(b.key));let running=0;
 const trend=chronology.map(r=>{running=Math.max(running,r.score);return {...r,bestSoFar:running}});
 return {team,best,combo,comboGap:Math.max(0,combo-(best?.score??0)),rank:index<0?null:index+1,totalTeams:ranked.length,ranked,opponent:comparison,scoreGap:comparison?Math.max(0,(comparison.best?.score??0)-(best?.score??0)):null,points,weakest,records:ownRecords,trend,identifiedCount:identified.length,todayCount:today.length,groups,passRate:completed?groups.pass/completed*100:null};
}
