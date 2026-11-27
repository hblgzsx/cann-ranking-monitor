import {observedSubmissions,pointScore,totalScore,validTime,resolveTbestOwners} from './scoring.mjs?v=20261127-validity';
import {rankTeams,referenceRelation} from './analytics.mjs?v=20261127-validity';
import {recoverTbestHistory} from './tbest-history.mjs?v=20261124-cases';
import {beijingDay} from './submissions.mjs?v=20261127-validity';

export const comparisonWindows=[{id:'5m',label:'5 分钟',ms:300000},{id:'1h',label:'1 小时',ms:3600000},{id:'6h',label:'6 小时',ms:21600000},{id:'24h',label:'24 小时',ms:86400000}];
const stamp=row=>Date.parse(row.at),finite=Number.isFinite;
const timelineCache=new WeakMap();
const caseCache=new WeakMap();
export function rangeFor(mode='all',day=beijingDay(),now=Date.now()){
 if(mode==='all')return {from:-Infinity,to:now};
 const start=Date.parse(day+'T00:00:00+08:00');if(!finite(start))throw Error('无效日期');
 if(mode==='week'){const weekday=new Date(start+8*3600000).getUTCDay();const from=start-((weekday+6)%7)*86400000;return {from,to:Math.min(now,from+7*86400000-1)}}
 return {from:start,to:Math.min(now,start+86400000-1)};
}
export function asOf(rows,at){let lo=0,hi=rows.length-1,best=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(stamp(rows[mid])<=at){best=mid;lo=mid+1}else hi=mid-1}return best<0?null:rows[best]}
function eligibleTimes(team,row){const times=row.latest??row.times??[];return times.map((time,index)=>(team.invalidatedResults??[]).some(r=>r.index===index&&r.time===time&&(row.submissionId?r.submissionId===row.submissionId:JSON.stringify(r.legacyTimes)===JSON.stringify(times)))?null:time)}
export function teamTimeline(data,team,basis='recomputed'){
 let cached=timelineCache.get(data);if(!cached){cached=new Map();timelineCache.set(data,cached)}const key=team.id+':'+basis;if(cached.has(key))return cached.get(key);
 const version=row=>basis==='official'?JSON.stringify([row.originalTestcaseIds??row.testcaseIds??data.testcaseIds,row.tbest??data.tbest]):'current:'+JSON.stringify(data.testcaseIds);
 const entries=(team.history??[]).map(row=>({...row,score:basis==='official'?row.official:totalScore(eligibleTimes(team,row),data.tbest),version:version(row),observedAt:row.at}));
 entries.push({at:team.lastSeen??data.capturedAt,observedAt:team.lastSeen??data.capturedAt,score:basis==='official'?team.officialScore:totalScore(eligibleTimes(team,{latest:team.latest,submissionId:team.submissionId}),data.tbest),version:version({}),submissionId:team.submissionId,submitter:team.submitter,status:team.status,submittedAt:team.submittedAt});
 const byTime=new Map();for(const row of entries)if(finite(stamp(row))&&finite(row.score))byTime.set(stamp(row),row);
 const rows=[...byTime.values()].sort((a,b)=>stamp(a)-stamp(b));cached.set(key,rows);return rows;
}
export function timelineInRange(rows,{from=-Infinity,to=Infinity}={},includeAnchor=false){const selected=rows.filter(r=>stamp(r)>=from&&stamp(r)<=to),anchor=includeAnchor&&asOf(rows,from);return anchor&&(!selected.length||stamp(selected[0])!==stamp(anchor))&&from<=to?[anchor,...selected]:selected}
export function changeAt(rows,at,windowMs){
 const current=asOf(rows,at),baseline=asOf(rows,at-windowMs);if(!current||!baseline||current.version!==baseline.version)return null;
 return {value:current.score-baseline.score,baseline:baseline.score,at:baseline.at,elapsed:at-stamp(baseline)};
}
export function sampleTimeline(rows,interval=60000,maxPoints=500){
 if(rows.length<=2)return rows;const buckets=new Map();for(const row of rows){const key=Math.floor(stamp(row)/Math.max(1,interval)),bucket=buckets.get(key)??[];bucket.push(row);buckets.set(key,bucket)}
 const out=[];for(const bucket of buckets.values()){const chosen=new Set([bucket[0],bucket.at(-1),bucket.reduce((a,b)=>a.score<b.score?a:b),bucket.reduce((a,b)=>a.score>b.score?a:b)]);for(const row of bucket)if(chosen.has(row))out.push(row)}
 if(out.length<=maxPoints)return out;const step=Math.ceil(out.length/maxPoints),selected=out.filter((_,i)=>i%step===0||i===out.length-1);return selected;
}
export function buildCaseReport(data,index,{mode='official'}={}){
 if(!Number.isInteger(index)||index<0||index>=data.tbest.length)throw Error('无效测试点');
 let cached=caseCache.get(data);if(!cached){cached={owners:resolveTbestOwners(data),ledger:recoverTbestHistory(data),ranked:new Map(),reports:new Map()};caseCache.set(data,cached)}
 const key=mode+':'+index;if(cached.reports.has(key))return cached.reports.get(key);
 if(!cached.ranked.has(mode))cached.ranked.set(mode,rankTeams(data,mode));
 const T=data.tbest[index],owner=cached.owners[index],ledger=cached.ledger,now=Date.parse(data.capturedAt);
 const rows=cached.ranked.get(mode).map(team=>{
  const times=mode==='official'?eligibleTimes(team,{latest:team.latest,submissionId:team.submissionId}):team.times,time=times[index];
  const sources=mode==='history'?observedSubmissions(team,data.tbest.length).filter(s=>s.times[index]===time&&validTime(time)):[];
  const source=sources[0]??(mode==='single'?team.bestSubmission:null);
  return {teamId:team.id,name:team.name,time,rawTime:mode==='official'?team.latest[index]:null,status:validTime(time)?'Pass':(team.invalidatedResults??[]).some(r=>r.index===index&&r.submissionId===(source?.submissionId??team.submissionId))?'旧结果失效':'缺失 / 未通过',teamStatus:team.metadata?.status,score:pointScore(time,T),delta:validTime(time)&&validTime(T)?time-T:null,ratio:validTime(time)&&validTime(T)?time/T:null,submissionId:source?.submissionId??team.metadata?.submissionId??'',submitter:source?.submitter??team.metadata?.submitter??null,owner:owner.teamIds.includes(team.id),sourceCount:sources.length};
 }).sort((a,b)=>validTime(a.time)&&validTime(b.time)?a.time-b.time||a.name.localeCompare(b.name,'zh-CN'):validTime(a.time)?-1:validTime(b.time)?1:a.name.localeCompare(b.name,'zh-CN'));
 const matching=rows.filter(r=>referenceRelation(r.time,T)==='matched'),changes=comparisonWindows.map(w=>{const base=asOf(ledger,now-w.ms),before=base?.tbest[index];return {...w,at:base?.at??null,before:before??null,improvement:validTime(before)&&validTime(T)?before-T:null,percent:validTime(before)&&validTime(T)?(before-T)/before*100:null}});
 const lastChange=[...ledger].reverse().find((p,i,reverse)=>reverse[i+1]?.tbest[index]!==p.tbest[index]);
 const report={index,id:data.testcaseIds[index],T,owner,matching,rows,changes,lastChangeAt:lastChange?.at??null,history:ledger.map(p=>({at:p.at,time:p.tbest[index],score:p.tbest[index],version:'reference',submissionId:p.submissionIds?.[index]}))};cached.reports.set(key,report);return report;
}
export function regionReport(data,config,mode='single'){
 const ranked=rankTeams(data,mode),groups=config.regions.map(r=>({...r,teams:[],average:null,total:null,top3:null,top10:0,scored:0})),byId=new Map(groups.map(g=>[g.id,g])),unknown=[];
 for(const team of ranked){const group=byId.get(config.assignments[team.id]);group?group.teams.push(team):unknown.push(team)}
 for(const group of groups){const valid=group.teams.filter(t=>finite(t.viewScore));group.scored=valid.length;if(valid.length){group.total=valid.reduce((s,t)=>s+t.viewScore,0);group.average=group.total/valid.length;group.top3=valid.slice(0,3).reduce((s,t)=>s+t.viewScore,0)/Math.min(3,valid.length)}group.top10=valid.filter(t=>t.rank<=10).length;group.teams=group.teams.map((t,i)=>({...t,regionRank:i&&group.teams[i-1].viewScore===t.viewScore?group.teams.findIndex(p=>p.viewScore===t.viewScore)+1:i+1}))}
 return {groups,unknown,matched:ranked.length-unknown.length,total:ranked.length};
}
export function drawdownReport(data,{from=-Infinity,to=Date.parse(data.capturedAt),basis='recomputed',minPeak=20,minDrop=5,minPercent=10}={}){
 if(![minPeak,minDrop,minPercent].every(v=>finite(v)&&v>=0)||minPercent>100)throw Error('无效回落阈值');
 return data.teams.filter(t=>!t.archived).map(team=>{
  const rows=timelineInRange(teamTimeline(data,team,basis),{from,to}),current=rows.at(-1);let peak=null,maxHistoricalDrop=0,episodes=0,inEpisode=false,recovered=false;
  for(const row of rows){if(!peak||peak.version!==row.version){peak=row;inEpisode=false}else if(row.score>peak.score)peak=row;const drop=peak.score-row.score,percent=peak.score>0?drop/peak.score*100:0,flagged=peak.score>=minPeak&&drop>=minDrop&&percent>=minPercent&&drop>0;if(flagged&&!inEpisode)episodes++;if(!flagged&&inEpisode)recovered=true;inEpisode=flagged;maxHistoricalDrop=Math.max(maxHistoricalDrop,drop)}
  const drop=peak&&current?Math.max(0,peak.score-current.score):null,percent=peak?.score>0?drop/peak.score*100:drop===0?0:null,flagged=peak&&current&&peak.version===current.version&&peak.score>=minPeak&&drop>=minDrop&&percent>=minPercent&&drop>0;
  const records=observedSubmissions(team,data.tbest.length),submissionCount=records.filter(r=>r.submissionId).length;
  return {teamId:team.id,name:team.name,current,peak,drop,percent,flagged:!!flagged,status:flagged?'flagged':recovered?'recovered':'normal',maxHistoricalDrop,episodes,submissionCount,rows,evidence:rows.slice(-12),basis};
 }).sort((a,b)=>(b.drop??-1)-(a.drop??-1)||a.name.localeCompare(b.name,'zh-CN'));
}
export function observationTimes(data){const times=new Set([Date.parse(data.capturedAt)]);for(const team of data.teams)for(const row of team.history??[])times.add(stamp(row));for(const row of data.tbestHistory??[])times.add(stamp(row));return [...times].filter(finite).sort((a,b)=>a-b)}
export function replayRanking(data,at,basis='official'){
 return data.teams.flatMap(team=>{const row=asOf(teamTimeline(data,team,basis),at);return row?[{teamId:team.id,name:team.name,score:row.score,observedAt:row.at,status:row.status??null,submissionId:row.submissionId??'',submitter:row.submitter??null,version:row.version}]:[]}).sort((a,b)=>b.score-a.score||a.teamId.localeCompare(b.teamId)).map((row,i,all)=>({...row,rank:i&&all[i-1].score===row.score?all.findIndex(r=>r.score===row.score)+1:i+1}));
}
export function leaderReport(data,range={},basis='official'){
 const from=range.from??-Infinity,to=Math.min(range.to??Infinity,Date.parse(data.capturedAt)),times=observationTimes(data).filter(at=>at>=from&&at<=to);if(finite(from)&&from<=to&&!times.includes(from))times.unshift(from);
 const intervals=[];
 for(const at of times){const ranked=replayRanking(data,at,basis);if(!ranked.length)continue;const leaders=ranked.filter(t=>t.rank===1),key=leaders.map(t=>t.teamId).sort().join('|'),previous=intervals.at(-1);if(previous?.key===key){previous.until=at;previous.lastScore=leaders[0].score}else{if(previous)previous.until=at;intervals.push({at,until:at,key,leaders,score:leaders[0].score,lastScore:leaders[0].score})}}
 if(intervals.length)intervals.at(-1).until=to;
 const counts=new Map();for(const interval of intervals)for(const leader of interval.leaders){const record=counts.get(leader.teamId)??{teamId:leader.teamId,name:leader.name,segments:0,duration:0};record.segments++;record.duration+=Math.max(0,interval.until-interval.at);counts.set(leader.teamId,record)}
 return {intervals,teams:[...counts.values()].sort((a,b)=>b.duration-a.duration),transitions:Math.max(0,intervals.length-1),basis};
}
export function archiveReport(data,range={}){
 const from=range.from??-Infinity,to=range.to??Infinity,byAt=new Map(),days=new Map();
 for(const team of data.teams)for(const row of team.history??[]){const at=stamp(row);if(at<from||at>to||!finite(at))continue;let event=byAt.get(at);if(!event){event={at:row.at,teamIds:new Set(),cases:new Set()};byAt.set(at,event)}event.teamIds.add(team.id)}
 for(const row of data.tbestHistory??[]){const at=stamp(row);if(at<from||at>to||!finite(at))continue;let event=byAt.get(at);if(!event){event={at:row.at,teamIds:new Set(),cases:new Set()};byAt.set(at,event)}for(let i=0;i<row.tbest.length;i++)if(validTime(row.tbest[i]))event.cases.add(i)}
 const events=[...byAt.values()].sort((a,b)=>stamp(b)-stamp(a)).map(e=>({...e,teamCount:e.teamIds.size,referenceCaseCount:e.cases.size}));
 for(const event of events){const day=beijingDay(event.at),record=days.get(day)??{day,count:0,first:event.at,last:event.at};record.count++;if(stamp(event)<Date.parse(record.first))record.first=event.at;if(stamp(event)>Date.parse(record.last))record.last=event.at;days.set(day,record)}
 return {events,days:[...days.values()].sort((a,b)=>b.day.localeCompare(a.day)),sampleCount:data.snapshotCount??null};
}
