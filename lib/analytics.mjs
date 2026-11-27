import {validTime,pointScore,totalScore,bestHistoricalSubmission,observedSubmissions,rankingSubmissionMetadata,resolveTbestOwners} from './scoring.mjs?v=20261127-validity';
export const modeLabel=mode=>mode==='history'?'逐点历史最优组合':mode==='single'?'最佳单次历史提交':'官方最新提交';
export function teamTimes(team,mode,tbest){return (mode==='history'?team.historical:mode==='single'?bestHistoricalSubmission(team,tbest)?.times:team.latest)??tbest.map(()=>null)}
export const reachesReference=(time,reference)=>validTime(time)&&validTime(reference)&&time<=reference*1.000001;
export function referenceRelation(time,reference){
 if(!validTime(time)||!validTime(reference))return 'missing';
 if(Math.abs(time-reference)<=Math.max(1e-9,Math.abs(reference)*1e-12))return 'matched';
 return time<reference?'historical-faster':'slower';
}
export function compareRankingRows(a,b,key,ascending=true){
 if(key==='name')return (ascending?1:-1)*a.name.localeCompare(b.name,'zh-CN');
 const value=t=>key.startsWith('point')?(validTime(t.times[Number(key.slice(5))])?t.times[Number(key.slice(5))]:null):key==='time'?(Number.isFinite(Date.parse(t.metadata?.submittedAt))?Date.parse(t.metadata.submittedAt):null):t.viewScore;
 const x=value(a),y=value(b);if(x===null||y===null)return x===y?a.rank-b.rank:x===null?1:-1;
 return (ascending?x-y:y-x)||a.rank-b.rank;
}
export function rankTeams(data,mode){
 return data.teams.filter(t=>!t.archived).map(t=>{
  const bestSubmission=bestHistoricalSubmission(t,data.tbest),times=(mode==='history'?t.historical:mode==='single'?bestSubmission?.times:t.latest)??data.tbest.map(()=>null);
  const analysisScore=totalScore(times,data.tbest),team={...t,bestSubmission};
  return {...team,times,metadata:rankingSubmissionMetadata(team,mode),analysisScore,viewScore:mode==='official'?t.officialScore:analysisScore,computed:totalScore(t.historical,data.tbest),validCount:times.filter(validTime).length,bestCount:times.filter((v,i)=>referenceRelation(v,data.tbest[i])==='matched').length,historicalFasterCount:times.filter((v,i)=>referenceRelation(v,data.tbest[i])==='historical-faster').length};
 }).sort((a,b)=>mode==='official'?a.officialRank-b.officialRank:b.analysisScore-a.analysisScore||a.officialRank-b.officialRank||a.id.localeCompare(b.id)).map((t,i)=>({...t,rank:mode==='official'?t.officialRank:i+1}));
}
// The export follows the selected view, using the same vector and identity as its rows.
export function rankingExport(data,mode,entries=rankTeams(data,mode),{date=x=>x??''}={}){
 const history=mode==='history',official=mode==='official',names=new Map(data.teams.map(t=>[t.id,t.name]));
 const owners=resolveTbestOwners(data).map(o=>({...o,label:o.teamIds.map(id=>names.get(id)).join('、')||'未采集到归属'}));
 const headers=[official?'官方排名':'排名','队伍',...(history?[]:[official?'最新提交人':'所选提交人',official?'最新状态':'所选提交状态']),history?'逐点组合分':official?'官方分':'最佳单次重算分',...(official?['当前TBest重算分（仅供分析）']:[]),'有效点','TBest点数',...(history?[]:['提交ID','实际提交时间(北京时间)','首次采集时间(北京时间)']),...data.tbest.flatMap((_,i)=>[`点${i+1}耗时(μs)`,`点${i+1}当前TBest(μs)`,`点${i+1}重算分`,`点${i+1}TBest队伍`,`点${i+1}归属依据`])];
 const rows=entries.map(t=>[t.rank,t.name,...(history?[]:[t.metadata?.submitter??'',t.metadata?.status??'']),t.viewScore,...(official?[t.analysisScore]:[]),`${t.validCount}/${data.tbest.length}`,t.bestCount,...(history?[]:[t.metadata?.submissionId??'',t.metadata?.submittedAt?date(t.metadata.submittedAt):'',t.metadata?.observedAt?date(t.metadata.observedAt):'']),...data.tbest.flatMap((T,i)=>[t.times[i],T,pointScore(t.times[i],T),owners[i].label,owners[i].method])]);
 return {headers,rows};
}
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
