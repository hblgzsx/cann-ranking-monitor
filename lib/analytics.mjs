import {validTime,totalScore,bestHistoricalSubmission,observedSubmissions} from './scoring.mjs?v=20261124-cases';
export const modeLabel=mode=>mode==='history'?'逐点历史最优组合':mode==='single'?'最佳单次历史提交':'官方最新提交';
export function teamTimes(team,mode,tbest){return mode==='history'?team.historical:mode==='single'?(bestHistoricalSubmission(team,tbest)?.times??tbest.map(()=>null)):team.latest}
export function rankTeams(data,mode){return data.teams.filter(t=>!t.archived).map(t=>({...t,analysisScore:totalScore(teamTimes(t,mode,data.tbest),data.tbest)})).sort((a,b)=>mode==='official'?a.officialRank-b.officialRank:b.analysisScore-a.analysisScore||a.officialRank-b.officialRank)}
export function snapshotChanges(previous,current){
 if(!previous||JSON.stringify(previous.testcaseIds)!==JSON.stringify(current.testcaseIds))return null;
 const tbest=current.tbest.flatMap((time,i)=>time!==previous.tbest[i]?[{index:i,before:previous.tbest[i],after:time}]:[]);
 const ranks={};
 for(const mode of ['history','single','official']){const old=new Map(rankTeams(previous,mode).map((t,i)=>[t.id,mode==='official'?t.officialRank:i+1]));for(const [i,t] of rankTeams(current,mode).entries()){ranks[t.id]??={};ranks[t.id][mode]=old.has(t.id)?old.get(t.id)-(mode==='official'?t.officialRank:i+1):null}}
 return {since:previous.capturedAt,at:current.capturedAt,tbest,ranks};
}
export function hasChanges(changes){return !!changes&&(changes.tbest.length>0||Object.values(changes.ranks).some(m=>Object.values(m).some(v=>v===null||v!==0)))}
export function estimateScenario(data,teamId,mode,times){
 const teams=rankTeams(data,mode),team=teams.find(t=>t.id===teamId);
 if(!team||times.length!==data.tbest.length||times.some(v=>v!==null&&!validTime(v)))throw Error('Invalid scenario');
 const before=totalScore(teamTimes(team,mode,data.tbest),data.tbest),after=totalScore(times,data.tbest);
 const predicted=teams.map(t=>({id:t.id,score:t.id===teamId?after:totalScore(teamTimes(t,mode,data.tbest),data.tbest),officialRank:t.officialRank})).sort((a,b)=>b.score-a.score||a.officialRank-b.officialRank);
 const original=teams.map(t=>({id:t.id,score:totalScore(teamTimes(t,mode,data.tbest),data.tbest),officialRank:t.officialRank})).sort((a,b)=>b.score-a.score||a.officialRank-b.officialRank);
 return {before,after,delta:after-before,beforeRank:original.findIndex(t=>t.id===teamId)+1,rank:predicted.findIndex(t=>t.id===teamId)+1,total:teams.length};
}
export function submissionsFor(team,tbest){return observedSubmissions(team,tbest.length).map((s,i)=>({...s,key:String(i),score:totalScore(s.times,tbest)}))}
