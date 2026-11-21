import {observedSubmissions,totalScore,validTime} from './scoring.mjs';
const pending=/^(pending|queued|running|judging|compiling|waiting)$/i;
export function statusGroup(status){return !status||/^(unknown|未记录)$/i.test(status)?'unknown':/^pass$/i.test(status)?'pass':pending.test(status)?'pending':'failed'}
export function beijingInputTime(value,end=false){if(!value)return null;const n=Date.parse(value+'+08:00');return Number.isFinite(n)?n+(end?(value.length===16?59999:999):0):NaN}
export function submissionRecords(data){
 return (data?.teams??[]).flatMap(team=>observedSubmissions(team,data.tbest.length).map(s=>{
  const submitted=Number.isFinite(Date.parse(s.submittedAt))?s.submittedAt:null,observed=Number.isFinite(Date.parse(s.observedAt))?s.observedAt:null;
  return {...s,key:team.id+':'+(s.submissionId?'id:'+s.submissionId:'legacy:'+JSON.stringify(s.times)),teamId:team.id,teamName:team.name,archived:!!team.archived,submitter:s.submitter??null,status:s.status??null,officialScore:Number.isFinite(s.officialScore)?s.officialScore:null,submittedAt:submitted,observedAt:observed,eventAt:submitted??observed,timeBasis:submitted?'submitted':observed?'observed':'unknown',score:totalScore(s.times,data.tbest),passedPoints:s.times.filter(validTime).length};
 }));
}
export function filterSubmissions(records,{query='',teamId='',status='',from=null,to=null,identity='',favoritesOnly=false,favoriteIds=new Set(),order='newest'}={}){
 const q=query.trim().toLowerCase();
 return records.filter(r=>(!teamId||r.teamId===teamId)&&(!favoritesOnly||favoriteIds.has(r.teamId))&&(!q||[r.teamName,r.submitter,r.submissionId].some(v=>String(v??'').toLowerCase().includes(q)))&&(!status||(['pass','pending','failed','unknown'].includes(status)?statusGroup(r.status)===status:r.status===status))&&(!identity||(identity==='known'?!!r.submissionId:!r.submissionId))&&((from===null&&to===null)||r.eventAt&&Number.isFinite(Date.parse(r.eventAt))&&(from===null||Date.parse(r.eventAt)>=from)&&(to===null||Date.parse(r.eventAt)<=to))).sort((a,b)=>{
  const x=Date.parse(a.eventAt),y=Date.parse(b.eventAt);if(!Number.isFinite(x)||!Number.isFinite(y))return Number.isFinite(x)?-1:Number.isFinite(y)?1:a.key.localeCompare(b.key);
  return (order==='oldest'?x-y:y-x)||a.key.localeCompare(b.key);
 });
}
export function beijingDay(timestamp=Date.now()){const n=typeof timestamp==='number'?timestamp:Date.parse(timestamp);return Number.isFinite(n)?new Date(n+8*3600000).toISOString().slice(0,10):null}
export function hourStatistics(records,teams,day,hour){
 if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('Invalid statistics hour');
 const begin=Date.parse(day+'T00:00:00+08:00')+hour*3600000,end=begin+3600000;
 return dayStatistics(records.filter(r=>r.timeBasis==='submitted'&&Date.parse(r.submittedAt)>=begin&&Date.parse(r.submittedAt)<end),teams,day);
}
export function dayStatistics(records,teams,day,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00+08:00')))throw Error('Invalid statistics date');
 const known=records.filter(r=>r.submissionId&&r.timeBasis==='submitted'&&beijingDay(r.submittedAt)===day);
 const legacy=records.filter(r=>(!r.submissionId||r.timeBasis!=='submitted')&&beijingDay(r.eventAt)===day);
 const groups={pass:0,failed:0,pending:0,unknown:0},hours=Array(24).fill(0),counts=new Map(teams.map(t=>[t.id,{id:t.id,name:t.name,archived:!!t.archived,count:0,pass:0}]));
 for(const r of known){const group=statusGroup(r.status);groups[group]++;hours[new Date(Date.parse(r.submittedAt)+8*3600000).getUTCHours()]++;if(!counts.has(r.teamId))counts.set(r.teamId,{id:r.teamId,name:r.teamName,count:0,pass:0});const team=counts.get(r.teamId);team.count++;if(group==='pass')team.pass++}
 const completed=groups.pass+groups.failed;
 return {total:known.length,legacy:legacy.length,activeTeams:new Set(known.map(r=>r.teamId)).size,groups,hours,teams:[...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN')),passRate:completed?groups.pass/completed*100:null,recent:known.filter(r=>Date.parse(r.submittedAt)>now-15*60000&&Date.parse(r.submittedAt)<=now).length,latest:known.reduce((last,r)=>!last||Date.parse(r.submittedAt)>Date.parse(last)?r.submittedAt:last,null)};
}
