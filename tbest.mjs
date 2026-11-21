import {prefixData,initTeamPrefixes} from './lib/team-prefix-ui.mjs?v=20261122-regions';
import {tbestReport,referenceImpact,tbestChangeText} from './lib/tbest-analysis.mjs?v=20261122-prefix';
import {liveData,cache} from './lib/live-data.mjs';
import {installIcons} from './lib/icons.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—',pct=n=>(n>0?'+':'')+fmt(n)+'%',time=n=>n>=1000?fmt(n/1000)+' ms':fmt(n)+' μs';
const date=t=>t&&Number.isFinite(Date.parse(t))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t)):'—';
const colors=['#3b82f6','#10b981','#f59e0b','#a78bfa','#f472b6','#06b6d4','#e57373','#84b43e','#cb8c38','#7186dd'];
const directionName={faster:'参考变快',slower:'参考回退',owner:'归属变更'};
let data=cache.get('cache'),report=null,client=null,busy=false,selectedAt=null,selectedEventKey=null,page=1,hidden=new Set(),teamSignature='',impactTeamId='',toastTimer;
function ownerHtml(owner){return `<span>${owner.teams.length?owner.teams.map(t=>`<a href="./team.html?team=${encodeURIComponent(t.id)}">${esc(t.name)}</a>`).join(' / '):'未采集到归属'}</span>${owner.method==='observed-match'?'<small>历史耗时匹配 · 归属未核实</small>':owner.method==='official-id'?'<small>官方提交 ID 已核对</small>':''}${owner.id?`<small title="官方 TBest 提交 ID">${esc(owner.id)}</small>`:'<small>未保存官方提交 ID</small>'}`}
function getFrom(){return $('#range').value==='all'?null:Date.now()-Number($('#range').value)*3600000}
function updateReport(){report=tbestReport(data,{from:getFrom(),caseIndex:$('#event-case').value==='all'?null:Number($('#event-case').value),direction:$('#event-direction').value})}
function renderMetrics(){
 const best=[...report.cases].sort((a,b)=>a.netPct-b.netPct)[0];
 const cards=[['基准变更批次',report.batchCount,'同一次采集中多点变化计一批'],['测试点耗时变化',report.changeCount,`${new Set(report.range.filter(e=>e.direction!=='owner').map(e=>e.index)).size} 个点发生变化`],['参考变快 / 回退',report.faster+' / '+report.slower,`另有 ${report.ownerChanges} 次已确认同耗时归属变化`],['最大净降幅',best&&best.netPct<0?fmt(-best.netPct)+'%':'0.00%',best&&best.netPct<0?`点 ${best.index+1} · 相对范围起点`:'范围内没有净降幅'],['最近耗时变化',report.lastChange?date(report.lastChange).split(' ')[1]:'—',report.lastChange?date(report.lastChange):'所选范围内未观察到变化']];
 $('#tbest-metrics').innerHTML=cards.map(([label,value,note])=>`<article><div class="metric-label">${label}</div><strong>${value}</strong><small>${note}</small></article>`).join('');
}
function renderChart(){
 const focus=$('#chart-case').value,raw=$('#chart-mode').value==='raw'&&focus!=='all',ids=focus==='all'?data.tbest.map((_,i)=>i).filter(i=>!hidden.has(i)):[Number(focus)];
 $('#chart-mode').disabled=focus==='all';if(focus==='all')$('#chart-mode').value='relative';
 $('#chart-description').textContent=`记录始于 ${date(report.history[0]?.at)} · 图中基线 ${date(report.start.at)}${focus==='all'?' · 点击图例隐藏或显示测试点':' · 可切换实际耗时纵轴'}`;
 $('#case-legend').innerHTML=data.tbest.map((_,i)=>`<button data-toggle-case="${i}" aria-label="显示或隐藏点 ${i+1}" aria-pressed="${focus==='all'?!hidden.has(i):Number(focus)===i}" style="--case-color:${colors[i%colors.length]}"><i></i>点 ${i+1}</button>`).join('');
 const rows=report.visibleHistory.length?report.visibleHistory:[report.last];
 if(!rows.some(p=>p.at===selectedAt)){selectedAt=rows.at(-1)?.at;selectedEventKey=null}
 const selected=report.history.find(p=>p.at===selectedAt)??report.last;
 $('#chart-point').innerHTML=rows.map(p=>{const changes=report.range.filter(e=>e.at===p.at);return `<option value="${esc(p.at)}">${date(p.at)} · ${changes.length?esc(changes.map(tbestChangeText).join(' / ')):'基准记录'}</option>`}).join('');$('#chart-point').value=selectedAt;
 const selectedIndex=rows.findIndex(p=>p.at===selectedAt);$('#previous-point').disabled=selectedIndex<=0;$('#next-point').disabled=selectedIndex>=rows.length-1;
 if(!ids.length){$('#tbest-chart').innerHTML='<div class="analysis-empty">请点击上方图例显示至少一个测试点。</div>'}else{
  const W=1100,H=290,L=65,R=24,T=25,B=32,start=Math.max(getFrom()??Date.parse(rows[0].at),Date.parse(rows[0].at)),end=Math.max(start+1000,Date.parse(data.capturedAt));
  const x=at=>L+Math.max(0,Date.parse(at)-start)/(end-start)*(W-L-R),value=(p,i)=>raw?p.tbest[i]:p.tbest[i]/report.start.tbest[i]*100;
  const values=rows.flatMap(p=>ids.map(i=>value(p,i))),min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.12,max*.025,raw?.001:1),lo=Math.max(0,min-pad),hi=max+pad,y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const chartRows=[...rows,{...rows.at(-1),at:data.capturedAt}];
  const steps=i=>chartRows.map((p,j)=>j?`H${x(p.at)}V${y(value(p,i))}`:`M${x(p.at)},${y(value(p,i))}`).join(' ');
  $('#tbest-chart').innerHTML=`<svg class="tbest-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="官方 TBest 变化阶梯图">${Array.from({length:5},(_,j)=>{const v=lo+(hi-lo)*j/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="4 5"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${fmt(v)}${raw?'':'%'}</text>`}).join('')}${ids.map(i=>`<path d="${steps(i)}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2"/>`).join('')}${rows.map(p=>`<g role="button" tabindex="0" data-at="${esc(p.at)}" aria-label="选择 ${date(p.at)} TBest 记录"><line x1="${x(p.at)}" x2="${x(p.at)}" y1="${T}" y2="${H-B}" stroke="${p.at===selectedAt?'var(--blue)':'transparent'}" stroke-width="1" stroke-dasharray="3 4"/><rect x="${x(p.at)-6}" y="${T}" width="12" height="${H-T-B}" fill="transparent"/>${ids.map(i=>`<circle cx="${x(p.at)}" cy="${y(value(p,i))}" r="${p.at===selectedAt?4:2.3}" fill="${colors[i%colors.length]}"/>`).join('')}<title>${esc(date(p.at)+' · '+(report.range.filter(e=>e.at===p.at).map(tbestChangeText).join(' / ')||'首次基准')+' · '+ids.map(i=>'点'+(i+1)+' '+time(p.tbest[i])).join(' / '))}</title></g>`).join('')}<text x="${L}" y="${H-7}">${date(new Date(start).toISOString())}</text><text x="${W-R}" y="${H-7}" text-anchor="end">${date(data.capturedAt)}</text></svg>`;
 }
 $('#chart-readout').innerHTML=ids.map(i=>`<div><small>点 ${i+1} · 所选记录</small><strong style="color:${colors[i%colors.length]}">${time(selected.tbest[i])}</strong><span>对比范围起点 ${pct((selected.tbest[i]/report.start.tbest[i]-1)*100)}</span></div>`).join('');
 renderChangeAttribution(selected.at,ids);renderImpact();
}
function renderChangeAttribution(at,visibleCases){
 const changes=report.range.filter(e=>e.at===at&&visibleCases.includes(e.index));
 $('#tbest-attribution').innerHTML=`<div class="tbest-attribution-heading"><strong>所选记录：${date(at)}</strong><span>谁更新了基准</span></div>${changes.length?changes.map(e=>`<article style="--case-color:${colors[e.index%colors.length]}"><div><b>点 ${e.index+1}</b><strong class="${e.direction==='faster'?'green':e.direction==='slower'?'tbest-net-bad':''}">${e.direction==='faster'?'↓ 降低 ':e.direction==='slower'?'↑ 回退 ':''}${e.direction==='owner'?'同耗时归属变化':fmt(Math.abs(e.changePct))+'%'}</strong></div><p class="tbest-owner">${ownerHtml(e.owner)}</p><small>${time(e.before)} → ${time(e.after)}</small></article>`).join(''):'<p class="muted">当前显示的测试点在此记录没有已观察到的变更。可切换其他记录或显示更多测试点。</p>'}`;
}
function renderCases(){
 $('#case-body').innerHTML=report.cases.map(p=>`<tr><th><button class="quiet-button" data-focus-case="${p.index}">点 ${p.index+1} · 看图</button></th><td class="numeric mono">${time(p.start)}</td><td class="numeric mono blue">${time(p.current)}</td><td class="numeric mono">${time(p.minimum)}</td><td class="numeric mono ${p.netPct<0?'tbest-net-good':p.netPct>0?'tbest-net-bad':''}">${pct(p.netPct)}</td><td class="mono"><span class="green">${p.faster}</span> / <span class="tbest-net-bad">${p.slower}</span></td><td class="tbest-owner">${ownerHtml(p.owners)}</td><td class="mono muted">${date(p.lastChange)}</td></tr>`).join('');
}
function renderImpact(){
 const event=report.events.find(e=>e.key===selectedEventKey&&e.at===selectedAt)??report.range.find(e=>e.at===selectedAt&&e.direction!=='owner')??report.range.find(e=>e.at===selectedAt);
 const result=referenceImpact(data,impactTeamId,event);
 if(!result){$('#impact-result').innerHTML='<div class="analysis-empty">请选择一次已观察到的基准变更。首次基准记录没有“变化前”数据。</div>';return}
 $('#impact-result').innerHTML=`<div class="impact-result"><div><small>变更前基准下得分</small><strong>${fmt(result.before)}</strong></div><div><small>变更后基准下得分</small><strong>${fmt(result.after)}</strong></div><div><small>纯基准影响</small><strong class="${result.delta<0?'loss':'green'}">${result.delta>0?'+':''}${fmt(result.delta)}</strong></div></div><div class="impact-context">变化首次观察于 <b>${date(event.at)}</b> · 此批次涉及 ${report.range.filter(e=>e.at===event.at&&e.direction!=='owner').length} 个耗时变化点<br>固定提交：${esc(result.submission.submissionId||'无 ID 旧快照')} · ${esc(result.team.name)}<br>此提交按当前全部历史重新选择为最佳单次，其耗时在两种基准计算中保持一致。<a class="blue" href="./team.html?team=${encodeURIComponent(result.team.id)}${result.submission.submissionId?'&submission='+encodeURIComponent(result.submission.submissionId):''}">查看该提交战报 ↗</a></div>`;
}
function renderEvents(){
 const rows=[...report.events].reverse(),pages=Math.max(1,Math.ceil(rows.length/40));page=Math.min(Math.max(1,page),pages);
 $('#event-count').textContent=`${rows.length} 条匹配变更 · 所有统计卡按时间范围计算`;
 $('#event-body').innerHTML=rows.slice((page-1)*40,page*40).map(e=>`<tr class="${e.at===selectedAt?'selected':''}"><td class="mono">${date(e.at)}${e.current.evidence==='legacy'?'<small class="range-note muted">旧快照重建</small>':''}</td><th>点 ${e.index+1}</th><td class="${e.direction==='faster'?'green':e.direction==='slower'?'tbest-net-bad':'muted'}">${directionName[e.direction]}</td><td class="numeric mono">${time(e.before)} → ${time(e.after)}</td><td class="numeric mono ${e.changePct<0?'green':e.changePct>0?'tbest-net-bad':''}">${pct(e.changePct)}</td><td class="tbest-owner">${ownerHtml(e.owner)}</td><td><button class="quiet-button" data-event="${esc(e.key)}">分析 ↗</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">所选范围没有匹配变更，可扩大范围或修改筛选。</td></tr>';
 $('#event-page').textContent=`第 ${page} / ${pages} 页 · 共 ${rows.length} 条`;
 $('#previous-page').disabled=page===1;$('#next-page').disabled=page===pages;
}
function render(){
 if(!data?.tbest?.length)return;data=prefixData(data);
 for(const id of ['chart-case','event-case']){const select=$('#'+id);if(select.options.length!==data.tbest.length+1)select.innerHTML='<option value="all">全部测试点</option>'+data.tbest.map((_,i)=>`<option value="${i}">点 ${i+1}</option>`).join('')}
 updateReport();const signature=data.teams.map(t=>t.id+t.name).join('|');
 if(signature!==teamSignature){teamSignature=signature;$('#impact-team').innerHTML=[...data.teams].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${t.archived?'（已离榜）':''}</option>`).join('')}
 if(!data.teams.some(t=>t.id===impactTeamId))impactTeamId=cache.get('pinned-teams',[]).find(id=>data.teams.some(t=>t.id===id))??data.teams[0].id;$('#impact-team').value=impactTeamId;
 renderMetrics();renderChart();renderCases();renderEvents();
 $('#screen-notice').textContent=`最新快照 ${date(data.capturedAt)} · TBest 记录始于 ${date(report.history[0]?.at)} · 每 15 秒检查。仅反映已观察到的官方基准变化。`;
 const stale=Date.now()-Date.parse(data.capturedAt)>90000;$('#screen-notice').classList.toggle('warning',stale);if(stale)$('#screen-notice').textContent+=' 数据已过期，正在重试。';
}
async function refresh(){if(busy||!client)return;busy=true;$('#refresh').disabled=true;try{const next=await client.read();if(!data||Date.parse(next.capturedAt)>Date.parse(data.capturedAt)){data=next;render()}}catch{$('#screen-notice').textContent='同步失败，保留最后有效数据；稍后自动重试。';$('#screen-notice').classList.add('warning')}finally{busy=false;$('#refresh').disabled=false}}
function selectAt(at,key=null){selectedAt=at;selectedEventKey=key;renderChart();renderEvents()}
$('#range').addEventListener('change',()=>{page=1;selectedAt=null;render()});$('#refresh').addEventListener('click',refresh);
for(const id of ['chart-case','chart-mode'])$('#'+id).addEventListener('change',renderChart);
$('#chart-point').addEventListener('change',e=>selectAt(e.target.value));
for(const [id,offset] of [['previous-point',-1],['next-point',1]])$('#'+id).addEventListener('click',()=>{const rows=report.visibleHistory,index=rows.findIndex(p=>p.at===selectedAt),target=rows[index+offset];if(target)selectAt(target.at)});
$('#case-legend').addEventListener('click',e=>{const b=e.target.closest('[data-toggle-case]');if(!b)return;const i=Number(b.dataset.toggleCase);if($('#chart-case').value!=='all'){$('#chart-case').value='all';hidden=new Set(data.tbest.map((_,j)=>j).filter(j=>j!==i))}else hidden.has(i)?hidden.delete(i):hidden.add(i);renderChart()});
$('#case-body').addEventListener('click',e=>{const b=e.target.closest('[data-focus-case]');if(b){$('#chart-case').value=b.dataset.focusCase;renderChart();$('.reference-chart-card').scrollIntoView({behavior:'smooth'})}});
for(const id of ['event-case','event-direction'])$('#'+id).addEventListener('change',()=>{page=1;updateReport();renderEvents()});
$('#event-body').addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(!b)return;const event=report.events.find(e=>e.key===b.dataset.event);if(event){selectAt(event.at,event.key);$('.impact-panel').scrollIntoView({behavior:'smooth',block:'start'})}});
$('#impact-team').addEventListener('change',e=>{impactTeamId=e.target.value;renderImpact()});
$('#previous-page').addEventListener('click',()=>{page--;renderEvents()});$('#next-page').addEventListener('click',()=>{page++;renderEvents()});
$('#tbest-chart').addEventListener('click',e=>{const b=e.target.closest('[data-at]');if(b)selectAt(b.dataset.at)});$('#tbest-chart').addEventListener('keydown',e=>{const b=e.target.closest('[data-at]');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectAt(b.dataset.at)}});
$('#theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;cache.set('theme',theme);try{localStorage.setItem('cann-monitor:theme',theme)}catch{}});
$('#export').addEventListener('click',()=>{
 if(!report?.events.length){$('#toast').textContent='没有可导出的变更';$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2500);return}
 const rows=[['首次采集时间(北京时间)','测试点','变化类型','变化前(μs)','变化后(μs)','变化百分比','匹配队伍','官方 TBest 提交ID','证据来源'],...[...report.events].reverse().map(e=>[date(e.at),e.index+1,directionName[e.direction],e.before,e.after,e.changePct,e.owner.teams.map(t=>t.name).join(' / '),e.owner.id,e.current.evidence])];
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"',blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cann-tbest-changes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
initTeamPrefixes({getData:()=>data,onChange:render});
installIcons();render();client=await liveData();await refresh();setInterval(()=>{if(!document.hidden)refresh()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
