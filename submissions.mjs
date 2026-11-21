import {pointScore,totalScore,validTime} from './lib/scoring.mjs';
import {createFeedClient} from './lib/feed.mjs';
import {submissionRecords,filterSubmissions,beijingInputTime,beijingDay,dayStatistics,statusGroup} from './lib/submissions.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
const date=t=>t&&Number.isFinite(Date.parse(t))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t)):'未记录';
const time=t=>validTime(t)?t>=1000?(t/1000).toFixed(2)+' ms':t.toFixed(2)+' μs':'—';
const storage={get(k,f){try{return JSON.parse(localStorage.getItem('cann-monitor:'+k))??f}catch{return f}},set(k,v){try{localStorage.setItem('cann-monitor:'+k,JSON.stringify(v))}catch{}}};
function statusClass(status){const map={'Pass':'pass','Wrong Answer':'wrong-answer','Runtime Error':'runtime-error','Compile Error':'compile-error','Time Limit Exceeded':'time-limit','Memory Limit Exceeded':'memory-limit','Output Limit Exceeded':'output-limit'};return map[status]??(statusGroup(status)==='pending'?'pending':'unknown')}
let data=null,records=[],shownData=null,shown=[],filtered=[],page=1,pageSize=50,busy=false,feed=null,frozen=false,showZero=false,selectedHour=null,detailKey=null,optionsSignature='',lastKnownKeys=new Set(),newKeys=new Set(),freezeKeys=new Set(),toastTimer;
let today=beijingDay(),followToday=true,refreshFailed=false,lastCheck=0;
$('#stats-day').value=today;
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function clock(){const now=new Date();$('#screen-clock').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);const day=beijingDay();if(day!==today){today=day;if(followToday){$('#stats-day').value=day;selectedHour=null;page=1;renderStats();renderList()}}if(data)freshness()}
function freshness(){
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.capturedAt))/1000));
 $('#updated').textContent=`快照 ${date(data.capturedAt)} · ${age<60?age+' 秒':Math.floor(age/60)+' 分钟'}前 · ${busy?'更新中':document.hidden?'后台显示暂停':`每 ${data.expectedIntervalSeconds??15} 秒检查`}`;
 const problem=refreshFailed||age>90||data.collector?.lastError;
 $('#screen-notice').classList.toggle('warning',!!problem);
 $('#screen-notice').textContent=problem?`${refreshFailed?'数据同步失败，正在重试。':data.collector?.lastError?'采集器暂有异常，自动退避重试。':''}当前保留最后有效快照（${date(data.capturedAt)}）。`:`采集始于 ${date(data.startedAt)} · ${data.collector?.provider==='cloudflare'?'Cloudflare 云端':'备用快照'}目标每 ${data.expectedIntervalSeconds??15} 秒采集。大屏仅统计可确认的提交，不能代表官方完整提交历史。`;
}
function renderStats(){
 if(!data)return;const day=$('#stats-day').value;if(!day)return;
 const stats=dayStatistics(records,data.teams,day),isToday=day===today;
 const cards=[{label:(isToday?'今日':'当日')+'已采集提交',value:stats.total,color:'blue',note:'按提交 ID 去重 · 实际提交日期'},{label:'活跃队伍',value:stats.activeTeams,note:`共 ${data.teams.length} 支已观察队伍`},{label:'已知结果通过率',value:stats.passRate===null?'—':stats.passRate.toFixed(1)+'%',color:'green',note:`Pass ${stats.groups.pass} / 未通过 ${stats.groups.failed}`},{label:'评测中 / 状态未记录',value:`${stats.groups.pending} / ${stats.groups.unknown}`,note:'未记录状态不计入通过率分母'},{label:isToday?'近 15 分钟提交':'最后一次提交',value:isToday?stats.recent:stats.latest?date(stats.latest).split(' ').at(-1):'—',note:`另有 ${stats.legacy} 条旧快照未计入次数`}];
 $('#day-metrics').innerHTML=cards.map(c=>`<article><div class="metric-label">${c.label}</div><strong class="${c.color??''}">${esc(c.value)}</strong><small>${esc(c.note)}</small></article>`).join('');
 const max=Math.max(1,...stats.hours),peak=stats.hours.indexOf(max);
 $('#hour-summary').textContent=stats.total?`峰值 ${String(peak).padStart(2,'0')}:00 · ${max} 次`:'所选日期暂无可确认的提交';
 $('#hour-chart').innerHTML=stats.hours.map((count,h)=>`<button class="hour-column" type="button" data-hour="${h}" data-active="${selectedHour===h}" aria-label="${h}时，${count}次提交，点击筛选" aria-pressed="${selectedHour===h}" style="--height:${count?Math.max(3,count/max*85):1}%"><span class="hour-fill"></span>${count?`<span class="hour-number">${count}</span>`:''}</button>`).join('');
 $('#active-team-count').textContent=`${stats.activeTeams} 队活跃`;
 const teams=stats.teams.filter(t=>showZero||t.count),teamMax=Math.max(1,...teams.map(t=>t.count));
 $('#team-counts').innerHTML=teams.map(t=>`<button class="team-count-row ${$('#record-team').value===t.id?'selected':''}" data-count-team="${esc(t.id)}" title="查看 ${esc(t.name)} 的 ${t.count} 次提交"><span>${esc(t.name)}${t.archived?' · 已离榜':''}</span><span class="team-count-track"><i style="width:${t.count/teamMax*100}%"></i></span><strong>${t.count}</strong></button>`).join('')||'<div class="record-empty">所选日期暂无可确认的提交。<br>可开启“显示零提交队伍”或切换日期。</div>';
}
function updateTeamOptions(){const sig=data.teams.map(t=>t.id+t.name).join('|');if(sig===optionsSignature)return;optionsSignature=sig;const selected=$('#record-team').value;$('#record-team').innerHTML='<option value="">全部队伍</option>'+[...data.teams].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${t.archived?'（已离榜）':''}</option>`).join('');$('#record-team').value=selected}
function filterOptions(){
 let from=beijingInputTime($('#record-from').value),to=beijingInputTime($('#record-to').value,true);const day=$('#stats-day').value;
 if($('#only-day').checked&&day){const begin=Date.parse(day+'T00:00:00+08:00'),end=begin+86400000-1;from=from===null?begin:Math.max(from,begin);to=to===null?end:Math.min(to,end)}
 return {query:$('#record-query').value,teamId:$('#record-team').value,status:$('#record-status').value,identity:$('#record-identity').value,from,to,order:$('#record-order').value,favoritesOnly:$('#record-favorites').checked,favoriteIds:new Set(storage.get('favorites',[]))};
}
function renderList(){
 if(!shownData)return;
 const options=filterOptions(),invalid=Number.isNaN(options.from)||Number.isNaN(options.to)||options.from!==null&&options.to!==null&&options.from>options.to;
 filtered=invalid?[]:filterSubmissions(shown,options);
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.max(1,Math.min(page,pages));
 const offset=(page-1)*pageSize,slice=filtered.slice(offset,offset+pageSize);
 $('#record-total').textContent=`${shown.filter(r=>r.submissionId).length} 份有 ID 的提交 · ${shown.filter(r=>!r.submissionId).length} 条无 ID 旧快照`;
 $('#filter-summary').textContent=invalid?'时间范围无效：起始时间不能晚于截止时间。':`匹配 ${filtered.length} / ${shown.length} 条记录${frozen?' · 列表固定于 '+date(shownData.capturedAt):''} · ${selectedHour===null?'列表时间范围独立于大屏日期':`已选 ${selectedHour}:00–${selectedHour}:59`}`;
 $('#filter-summary').classList.toggle('date-error',invalid);
 $('#record-body').innerHTML=slice.map(r=>`<tr class="${newKeys.has(r.key)?'record-new':''}"><td><span class="record-time">${esc(date(r.eventAt))}</span>${r.timeBasis==='observed'?'<span class="record-legacy">首次采集时间 · 非提交时间</span>':r.timeBasis==='unknown'?'<small>无可用时间</small>':`<small>首次采集 ${date(r.observedAt)}</small>`}</td><td class="record-team"><strong title="${esc(r.teamName)}">${esc(r.teamName)}</strong><small>${esc(r.submitter??'提交者未记录')}${r.archived?' · 已离榜':''}</small></td><td><span class="status ${statusClass(r.status)}">${esc(r.status??'状态未记录')}</span></td><td class="numeric score mono">${fmt(r.score)}</td><td class="numeric mono">${fmt(r.officialScore)}</td><td class="numeric mono">${r.passedPoints} / ${shownData.tbest.length}</td><td class="record-id" title="${esc(r.submissionId||'无提交 ID，按旧耗时向量保留')}">${esc(r.submissionId||'无 ID · 旧快照')}</td><td><button class="quiet-button" data-record="${esc(r.key)}">逐点详情 ↗</button></td></tr>`).join('')||`<tr><td colspan="8" class="empty">${invalid?'请修正时间范围。':'没有匹配记录，可清空筛选或扩大时间范围。'}</td></tr>`;
 $('#page-label').textContent=`第 ${page} / ${pages} 页 · ${filtered.length?offset+1:0}–${offset+slice.length} 条`;
 $('#prev-page').disabled=page===1;$('#next-page').disabled=page===pages;
 const pending=frozen?records.filter(r=>!freezeKeys.has(r.key)).length:0;
 $('#record-updates').textContent=frozen?`列表已冻结${pending?` · 后台新增 ${pending} 条，恢复后显示`:''}`:newKeys.size?`本轮新增 ${newKeys.size} 条记录 · 自动更新中`:'云端采集继续 · 列表自动更新';
 $('#record-updates').classList.toggle('freeze-note',frozen);
}
function render(){if(!data)return;records=submissionRecords(data);newKeys=new Set(lastKnownKeys.size?records.filter(r=>!lastKnownKeys.has(r.key)).map(r=>r.key):[]);lastKnownKeys=new Set(records.map(r=>r.key));updateTeamOptions();renderStats();if(!frozen){shownData=data;shown=records}renderList();freshness();if(detailKey&&$('#record-dialog').open)renderDetail(detailKey)}
function renderDetail(key){
 const r=shown.find(r=>r.key===key);if(!r)return;detailKey=key;
 $('#record-detail-title').textContent=r.teamName;
 $('#record-detail-subtitle').textContent=`${r.submitter??'提交者未记录'} · ${r.status??'状态未记录'} · ${r.timeBasis==='submitted'?'提交于':'首次采集于'} ${date(r.eventAt)}`;
 $('#record-detail').innerHTML=`<div class="submission-id-full">${r.submissionId?'提交 ID：'+esc(r.submissionId):'此为无提交 ID 的旧耗时快照，无法确认为独立提交。'}</div><div class="submission-meta"><div><small>当前 TBest 重算总分</small><strong class="blue mono">${fmt(r.score)}</strong></div><div><small>采集时官方分</small><strong class="mono">${fmt(r.officialScore)}</strong></div><div><small>有效测试点</small><strong class="mono">${r.passedPoints} / ${shownData.tbest.length}</strong></div><div><small>实际提交时间</small><strong>${date(r.submittedAt)}</strong></div><div><small>首次采集时间</small><strong>${date(r.observedAt)}</strong></div><div><small>官方分记录时间</small><strong>${r.officialScore===null?'未记录':date(r.officialScoreAt??r.lastObservedAt)}</strong></div></div><div class="detail-table"><table><thead><tr><th>测试点</th><th class="numeric">本次有效耗时</th><th class="numeric">当前官方 TBest</th><th class="numeric">t / T</th><th class="numeric">重算得分</th></tr></thead><tbody>${shownData.tbest.map((T,i)=>`<tr><th>点 ${i+1}</th><td class="numeric mono ${validTime(r.times[i])&&r.times[i]<=T?'green':''}">${time(r.times[i])}</td><td class="numeric mono muted">${time(T)}</td><td class="numeric mono">${validTime(r.times[i])?(r.times[i]/T).toFixed(2)+'×':'—'}</td><td class="numeric mono blue">${fmt(pointScore(r.times[i],T))}</td></tr>`).join('')}</tbody></table></div><p class="detail-note">本次完整提交按 ${date(shownData.capturedAt)} 快照的官方 TBest 重算，缺失或未通过的点计 0 分。原始旧记录未保存的字段显示“未记录”。</p><div class="analysis-bottom-actions"><a class="button" href="./team.html?team=${encodeURIComponent(r.teamId)}">队伍战报 ↗</a><a class="button" href="./#team=${encodeURIComponent(r.teamId)}">队伍排名与历史最优 ↗</a></div>`;
}
async function refresh(manual=false){
 if(busy)return;busy=true;$('#refresh').disabled=true;
 try{
  let candidate,error;if(feed)try{candidate=await feed.read()}catch(e){error=e}
  if(!candidate){for(const url of ['https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/data/latest.json','./data/latest.json'])try{const res=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('HTTP '+res.status);const next=await res.json();if(next.schemaVersion!==1||!next.teams?.length||!next.tbest?.length)throw Error('Invalid snapshot');candidate=next;break}catch(e){error=e}}
  if(!candidate)throw error;
  refreshFailed=!!feed&&candidate.collector?.provider!=='cloudflare';
  if(!data||Date.parse(candidate.capturedAt)>Date.parse(data.capturedAt)){data=candidate;storage.set('cache',data);render()}else freshness();
  if(manual)toast(refreshFailed?'云端暂不可用，显示最后有效数据':'已检查最新提交记录');
 }catch{refreshFailed=true;if(data)freshness();else{$('#screen-notice').textContent='暂时无法读取共享数据，请稍后重试。';$('#screen-notice').classList.add('warning')}if(manual)toast('同步失败，保留原有记录')}
 finally{busy=false;lastCheck=Date.now();$('#refresh').disabled=false}
}
function clearFilters(){for(const id of ['record-query','record-team','record-status','record-identity','record-from','record-to'])$('#'+id).value='';$('#only-day').checked=false;$('#record-favorites').checked=false;$('#record-order').value='newest';selectedHour=null;page=1;renderStats();renderList()}
$('#record-filters').addEventListener('submit',e=>e.preventDefault());
$('#record-filters').addEventListener('input',e=>{if(e.target.id==='record-from'||e.target.id==='record-to')selectedHour=null;page=1;renderList()});
$('#record-filters').addEventListener('change',()=>{page=1;renderStats();renderList()});
$('#stats-day').addEventListener('change',()=>{followToday=$('#stats-day').value===today;if(selectedHour!==null){$('#record-from').value='';$('#record-to').value=''}selectedHour=null;page=1;renderStats();renderList()});
$('#today').addEventListener('click',()=>{$('#stats-day').value=today;followToday=true;if(selectedHour!==null){$('#record-from').value='';$('#record-to').value=''}selectedHour=null;page=1;renderStats();renderList()});
$('#show-zero').addEventListener('click',()=>{showZero=!showZero;$('#show-zero').setAttribute('aria-pressed',showZero);$('#show-zero').textContent=showZero?'隐藏零提交队伍':'显示零提交队伍';renderStats()});
$('#team-counts').addEventListener('click',e=>{const button=e.target.closest('[data-count-team]');if(!button)return;$('#record-team').value=$('#record-team').value===button.dataset.countTeam?'':button.dataset.countTeam;$('#only-day').checked=true;page=1;renderStats();renderList();$('#record-title').scrollIntoView({behavior:'smooth',block:'start'})});
$('#hour-chart').addEventListener('click',e=>{const button=e.target.closest('[data-hour]');if(!button)return;const h=Number(button.dataset.hour);selectedHour=selectedHour===h?null:h;$('#only-day').checked=true;const day=$('#stats-day').value;$('#record-from').value=selectedHour===null?'':`${day}T${String(h).padStart(2,'0')}:00`;$('#record-to').value=selectedHour===null?'':`${day}T${String(h).padStart(2,'0')}:59`;page=1;renderStats();renderList()});
$('.quick-ranges').addEventListener('click',e=>{const button=e.target.closest('[data-range]');if(!button)return;const n=Number(button.dataset.range),now=Date.now(),input=timestamp=>new Date(timestamp+8*3600000).toISOString().slice(0,16);$('#record-from').value=input(now-n*60000);$('#record-to').value=input(now);$('#only-day').checked=false;selectedHour=null;page=1;renderStats();renderList()});
$('#clear-records').addEventListener('click',clearFilters);
$('#freeze').addEventListener('click',()=>{if(!data)return;frozen=!frozen;freezeKeys=new Set(records.map(r=>r.key));$('#freeze').setAttribute('aria-pressed',frozen);$('#freeze').textContent=frozen?'▷ 恢复列表更新':'Ⅱ 冻结列表';if(!frozen){shownData=data;shown=records}renderList()});
$('#page-size').addEventListener('change',e=>{pageSize=Number(e.target.value);page=1;renderList()});
$('#prev-page').addEventListener('click',()=>{page--;renderList()});$('#next-page').addEventListener('click',()=>{page++;renderList()});
$('#record-body').addEventListener('click',e=>{const button=e.target.closest('[data-record]');if(button){renderDetail(button.dataset.record);$('#record-dialog').showModal()}});
$('#close-record').addEventListener('click',()=>$('#record-dialog').close());$('#record-dialog').addEventListener('close',()=>detailKey=null);
$('#theme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('cann-monitor:theme',next)}catch{}});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('浏览器暂不支持全屏，可使用 F11')}});
document.addEventListener('fullscreenchange',()=>$('#fullscreen').textContent=document.fullscreenElement?'⤢ 退出全屏':'⛶ 全屏');
$('#refresh').addEventListener('click',()=>refresh(true));
$('#export-records').addEventListener('click',()=>{
 if(!filtered.length){toast('没有可导出的筛选记录');return}
 const header=['队伍','提交者','状态','提交ID','实际提交时间(北京时间)','首次采集时间(北京时间)','排序时间依据','当前TBest重算分','采集时官方分','官方分记录时间(北京时间)',...shownData.tbest.flatMap((_,i)=>[`点${i+1}有效耗时(μs)`,`点${i+1}当前TBest(μs)`,`点${i+1}重算分`])];
 const rows=filtered.map(r=>[r.teamName,r.submitter,r.status,r.submissionId,r.submittedAt?date(r.submittedAt):'',r.observedAt?date(r.observedAt):'',r.timeBasis,fmt(r.score),r.officialScore===null?'':fmt(r.officialScore),r.officialScoreAt?date(r.officialScoreAt):'',...shownData.tbest.flatMap((T,i)=>[r.times[i],T,pointScore(r.times[i],T)])]);
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"',blob=new Blob(['\uFEFF'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='cann-submissions-'+beijingDay()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${filtered.length} 条筛选记录`);
});
data=storage.get('cache',null);if(data?.schemaVersion===1&&data.teams?.length)render();else data=null;
try{const config=await fetch('./data-source.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(6000)}).then(r=>r.json());if(/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(config.cloudflareEndpoint)){feed=createFeedClient(config.cloudflareEndpoint,{cache:storage.get('cloud-feed',null),save:state=>storage.set('cloud-feed',state)})}}catch{}
const urlTeam=new URLSearchParams(location.search).get('team');if(urlTeam){$('#record-team').value=urlTeam;renderStats();renderList()}
clock();setInterval(clock,1000);await refresh();if(urlTeam){$('#record-team').value=urlTeam;renderStats();renderList()}
setInterval(()=>{if(!document.hidden)refresh()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>5000)refresh()});
