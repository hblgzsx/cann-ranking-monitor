import {alignVector} from './case-evolution.mjs?v=20261124-cases';
import {observedSubmissions,validTime} from './scoring.mjs?v=20261127-validity';

// Audited user-provided history. These are submissions, not new collector observations.
export const manualSubmissions=[{
 teamId:'6b00195685ad43bbe0627a47',teamName:'Lizzop',
 submissionId:'6b0780b485ad43bbe071d047',displaySubmissionId:'1549964',
 submitter:'Cyrus',submittedAt:'2026-11-26T00:43:32.000Z',status:'Pass',
 importedAt:'2026-11-26T00:59:02.000Z',
 sourceUrl:'https://cannjudge.cn/public/2026_cann_final/batcheddiaggmmem/submission/6b0780b485ad43bbe071d047',
 testcaseIds:['6afffa9785ad43bbe02307bb','6afffa9785ad43bbe02307bf','6afffa9785ad43bbe02307c3','6afffa9785ad43bbe02307c7','6afffa9785ad43bbe02307cb','6afffa9785ad43bbe02307cf','6afffa9785ad43bbe02307d3','6afffa9785ad43bbe02307d7','6afffa9785ad43bbe02307db','6afffa9785ad43bbe02307df','6b04e7d585ad43bbe03b724e','6b04e7d585ad43bbe03b7250','6b04e7d585ad43bbe03b7252'],
 times:[2.90,151.91,3.10,95.79,49.24,40.04,83.44,63.52,112.90,268.59,23300,91.22,11900],
 timeResolutionUs:[.01,.01,.01,.01,.01,.01,.01,.01,.01,.01,100,.01,100],
 tbestAtSubmission:[2.15,96.54,2.40,42.41,49.24,25.55,58.11,36.34,56.09,137.90,4000,57.74,1440]
}];

export function manualSubmissionNote(record){return record?.source==='manual-user'?'手工补录 · 用户提供的页面展示精度，重算分为近似值；未提供官方总分。':''}

export function applyManualSubmissions(data,entries=manualSubmissions){
 if(!data?.teams?.length||!data.testcaseIds?.length)return data;
 let changed=false;
 const teams=data.teams.map(team=>{
  let enriched=false;
  const submissions=(team.submissions??[]).map(s=>{
   const entry=entries.find(e=>e.teamId===team.id&&e.submissionId===s.submissionId);
   if(s.source!=='manual-user'||!entry)return s;
   const displayPrecisionUs=Object.fromEntries(entry.testcaseIds.map((id,i)=>[id,entry.timeResolutionUs?.[i]??null]));
   if(JSON.stringify(s.displayPrecisionUs)===JSON.stringify(displayPrecisionUs))return s;
   enriched=true;return {...s,displayPrecisionUs};
  });
  const known=new Set(observedSubmissions(team,data.tbest.length).map(s=>s.submissionId)),added=[];
  for(const entry of entries){
   if(entry.teamId!==team.id||known.has(entry.submissionId))continue;
   if(!entry.submissionId||entry.testcaseIds.length!==entry.times.length||entry.times.some(t=>!validTime(t)))throw Error('Invalid manual submission');
   const times=alignVector(entry.times,entry.testcaseIds,data.testcaseIds);
   added.push({submissionId:entry.submissionId,displaySubmissionId:entry.displaySubmissionId,submitter:entry.submitter,submittedAt:entry.submittedAt,status:entry.status,times,assessed:times.map(validTime),originalTestcaseIds:entry.testcaseIds,displayPrecisionUs:Object.fromEntries(entry.testcaseIds.map((id,i)=>[id,entry.timeResolutionUs?.[i]??null])),observedAt:entry.importedAt,lastObservedAt:entry.importedAt,source:'manual-user',timingPrecision:'display-rounded',sourceUrl:entry.sourceUrl,tbestAtSubmission:entry.tbestAtSubmission});
   known.add(entry.submissionId);
  }
  if(!added.length&&!enriched)return team;
  changed=true;
  const historical=data.tbest.map((_,i)=>{const times=[team.historical?.[i],...added.map(s=>s.times[i])].filter(validTime);return times.length?Math.min(...times):null});
  return {...team,historical,submissions:[...submissions,...added]};
 });
 return changed?{...data,teams}:data;
}
