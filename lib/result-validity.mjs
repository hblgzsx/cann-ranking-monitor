import {recoverTbestHistory} from './tbest-history.mjs?v=20261124-cases';
import {observedSubmissions,validTime} from './scoring.mjs?v=20261127-validity';

// A reference rollback withdraws earlier, faster results from current analysis.
// Keep original vectors and IDs for audit; never label a team as violating rules.
export function applyResultValidity(data){
 if(!data?.teams?.length||!data.testcaseIds?.length)return data;
 const history=recoverTbestHistory(data),rollbacks=[];
 for(let h=1;h<history.length;h++)for(let i=0;i<data.testcaseIds.length;i++){
  const before=history[h-1].tbest[i],after=history[h].tbest[i];
  if(validTime(before)&&validTime(after)&&after-before>Math.max(1e-9,before*1e-12))rollbacks.push({caseId:data.testcaseIds[i],index:i,at:history[h].at,before,after});
 }
 let changed=false,excludedCount=0;
 const teams=data.teams.map(team=>{
  const records=observedSubmissions({...team,invalidatedResults:[],submissions:(team.submissions??[]).map(s=>s.rawTimes?{...s,times:s.rawTimes}:s)},data.tbest.length),invalidated=[];
  for(const record of records){
   const date=record.submittedAt??record.observedAt,when=Date.parse(date);
   if(!Number.isFinite(when))continue;
   for(let i=0;i<data.testcaseIds.length;i++){
    const time=record.times[i];if(!validTime(time))continue;
    const rollback=rollbacks.find(r=>r.index===i&&when<=Date.parse(r.at)&&time<r.after-Math.max(1e-9,r.after*1e-12));
    if(rollback)invalidated.push({submissionId:record.submissionId??'',legacyTimes:record.submissionId?null:record.times,caseId:rollback.caseId,index:i,time,invalidatedAt:rollback.at,referenceBefore:rollback.before,referenceAfter:rollback.after,reason:'reference-rollback'});
   }
  }
  if(!invalidated.length&&!(team.invalidatedResults?.length))return team;
  excludedCount+=invalidated.length;
  const candidate={...team,invalidatedResults:invalidated},eligible=observedSubmissions(candidate,data.tbest.length);
  const historical=data.tbest.map((_,i)=>{
   const old=team.historical?.[i],oldInvalid=invalidated.some(r=>r.index===i&&r.time===old);
   const values=[oldInvalid?null:old,...eligible.map(s=>s.times[i])].filter(validTime);return values.length?Math.min(...values):null;
  });
  if(JSON.stringify(team.invalidatedResults)===JSON.stringify(invalidated)&&JSON.stringify(team.historical)===JSON.stringify(historical))return team;
  changed=true;return {...candidate,historical};
 });
 if(!changed&&data.resultValidity?.excludedCount===excludedCount)return data;
 if(!excludedCount&&!changed)return data;
 // Collector rank arrows were computed before these eligibility exclusions.
 const changes=data.changes?{...data.changes,ranks:Object.fromEntries(Object.entries(data.changes.ranks??{}).map(([id,m])=>[id,{official:m.official}]))}:data.changes;
 return {...data,teams,changes,resultValidity:{version:1,excludedCount,policy:'exclude-pre-rollback-results-faster-than-restored-reference'}};
}

export function invalidatedResultNote(record){const cases=record?.invalidatedCases??[];return cases.length?`点 ${cases.map(r=>r.index+1).join('、')}：旧基准回退后结果已失效，不参与当前计分；原始耗时保留供核对。`:''}
