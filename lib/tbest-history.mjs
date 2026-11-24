const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>x===null||valid(x));
const compatible=(a,b)=>a?.tbest?.length===b?.tbest?.length&&JSON.stringify(a?.testcaseIds)===JSON.stringify(b?.testcaseIds);
// Legacy histories are evidence of reference values at capture time, not official change times.
export function recoverTbestHistory(data){
 const n=data?.tbest?.length??0;if(!n)return [];
 const candidates=[];
 const add=(row,priority)=>{if(vector(row?.tbest,n)&&Number.isFinite(Date.parse(row.at)))candidates.push({at:row.at,tbest:[...row.tbest],submissionIds:[...(row.submissionIds??row.tbestSubmissionIds??Array(n).fill(''))],evidence:row.evidence??'snapshot',priority})};
 for(const t of data.teams??[])for(const p of t.history??[])add({...p,evidence:'legacy'},1);
 for(const p of data.tbestHistory??[])add(p,2);
 add({at:data.capturedAt,tbest:data.tbest,submissionIds:data.tbestSubmissionIds,evidence:'snapshot'},3);
 const byTime=new Map();for(const p of candidates.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.priority-b.priority))byTime.set(Date.parse(p.at),p);
 const result=[];
 for(const p of byTime.values()){
  const previous=result.at(-1);const ownerKnown=p.submissionIds.some(Boolean);
  if(previous&&JSON.stringify(previous.tbest)===JSON.stringify(p.tbest)&&(!ownerKnown||JSON.stringify(previous.submissionIds)===JSON.stringify(p.submissionIds)))continue;
  const {priority,...entry}=p;result.push(entry);
 }
 return result;
}
export function updateTbestHistory(previous,snapshot){
 const same=compatible(previous,snapshot);
 const history=same?(previous.tbestHistoryVersion===1?[...(previous.tbestHistory??[])]:recoverTbestHistory(previous)):[];
 const last=history.at(-1),ids=[...(snapshot.tbestSubmissionIds??Array(snapshot.tbest.length).fill(''))];
 if(!last||JSON.stringify(last.tbest)!==JSON.stringify(snapshot.tbest)||JSON.stringify(last.submissionIds)!==JSON.stringify(ids))history.push({at:snapshot.capturedAt,tbest:[...snapshot.tbest],submissionIds:ids,evidence:'snapshot'});
 return history;
}
