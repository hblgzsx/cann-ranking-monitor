const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export const incompleteStatus=status=>/incomplete|not fully|partially|未完整|不完整|未评测/i.test(status??'');
export function alignVector(values,from,to,missing=null){
 const indices=new Map((from??[]).map((id,i)=>[id,i]));
 return to.map(id=>indices.has(id)?values?.[indices.get(id)]??missing:missing);
}
// Preserve identities and original observation dates; never assign a newly opened case an old time.
export function alignHistory(previous,ids){
 if(!previous||JSON.stringify(previous.testcaseIds)===JSON.stringify(ids))return previous;
 if(!previous.testcaseIds?.length)throw Error('Cannot align history without stable testcase IDs');
 const from=previous.testcaseIds,align=v=>alignVector(v,from,ids),alignInvalid=rows=>(rows??[]).filter(r=>ids.includes(r.caseId)).map(r=>({...r,index:ids.indexOf(r.caseId),legacyTimes:r.legacyTimes?align(r.legacyTimes):null}));
 const historyRow=p=>({...p,originalTestcaseIds:p.originalTestcaseIds??p.testcaseIds??from,testcaseIds:ids,latest:align(p.latest),assessed:alignVector(p.assessed??p.latest?.map(valid),from,ids,false),tbest:align(p.tbest),tbestSubmissionIds:alignVector(p.tbestSubmissionIds,from,ids,'')});
 return {...previous,testcaseIds:ids,tbest:align(previous.tbest),tbestSubmissionIds:alignVector(previous.tbestSubmissionIds,from,ids,''),tbestLastValidAt:align(previous.tbestLastValidAt),teams:(previous.teams??[]).map(t=>({...t,...(t.invalidatedResults?{invalidatedResults:alignInvalid(t.invalidatedResults)}:{}),latest:align(t.latest),latestAssessed:alignVector(t.latestAssessed??t.latest?.map(valid),from,ids,false),historical:align(t.historical),submissions:(t.submissions??[]).map(s=>({...s,originalTestcaseIds:s.originalTestcaseIds??from,times:align(s.times),...(s.rawTimes?{rawTimes:align(s.rawTimes)}:{}),...(s.invalidatedCases?{invalidatedCases:alignInvalid(s.invalidatedCases)}:{}),assessed:alignVector(s.assessed??s.times?.map(valid),from,ids,false)})),history:(t.history??[]).map(historyRow)})),tbestHistory:(previous.tbestHistory??[]).map(p=>({...p,testcaseIds:ids,tbest:align(p.tbest),submissionIds:alignVector(p.submissionIds,from,ids,'')}))};
}
export function referenceNotice(data){
 if(!data)return '';
 const retained=(data.tbestStatus??[]).flatMap((s,i)=>s==='retained'?[i+1]:[]),missing=data.tbest.flatMap((v,i)=>valid(v)?[]:[i+1]);
 const parts=[];
 if(data.resultValidity?.excludedCount)parts.push(`已排除 ${data.resultValidity.excludedCount} 条因基准回退而失效的历史测试点结果，原始记录保留`);
 if(retained.length)parts.push(`点 ${retained.join('、')} 的官方 TBest 暂缺，使用最后有效参考值（暂估）`);
 if(missing.length)parts.push(`点 ${missing.join('、')} 尚无有效 TBest，相关重算分暂记 0`);
 const change=data.caseStages?.at(-1);if(change?.added?.length)parts.push(`新增 ${change.added.length} 个 case 后，旧提交未评测的新点记 0，历史已保留`);
 return parts.join('；');
}
