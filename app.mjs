import {installIcons} from './lib/icons.mjs';
installIcons();
import {pointScore,totalScore,validTime,bestHistoricalSubmission,resolveTbestOwners} from './lib/scoring.mjs?v=20261121-history';
import {initAnalysis} from './lib/analysis-ui.mjs?v=20261121-analysis';
import {createFeedClient} from './lib/feed.mjs?v=20261122-cloud';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k,f){try{return JSON.parse(localStorage.getItem('cann-monitor:'+k))??f}catch{return f}},set(k,v){try{localStorage.setItem('cann-monitor:'+k,JSON.stringify(v))}catch{}}};
let data=null,view='history',paused=false,busy=false,query='',onlyFavorites=false,sortKey='score',ascending=false,selectedTeam=null,selectedChartAt=null,toastTimer;
let nextCheckAt=Date.now()+15000;
let cloudFeed=null,cloudEndpoint='',cloudStatus=null;
const favoriteIds=new Set(storage.get('favorites',[]));
const pinnedIds=new Set(storage.get('pinned-teams',[]));
const remote='https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/data/latest.json';
const fmt=n=>Number.isFinite(n)?(Math.abs(n)<.005?'0.00':n.toFixed(2)):'—';
function time(t){if(!validTime(t))return '—';return t>=1e6?(t/1e6).toFixed(2)+' s':t>=1000?(t/1000).toFixed(2)+' ms':t.toFixed(2)+' μs'}
function date(t,short=false){if(!t)return '—';const d=new Date(t);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',...(short?{}:{month:'2-digit',day:'2-digit'}),hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)}
function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function statusClass(status){const s=String(status).trim().toLowerCase();if(s==='pass')return 'pass';if(s==='wrong answer')return 'wrong-answer';if(s==='runtime error')return 'runtime-error';if(s==='compile error')return 'compile-error';if(s==='time limit exceeded'||s==='timeout')return 'time-limit';if(s==='memory limit exceeded')return 'memory-limit';if(s==='output limit exceeded')return 'output-limit';if(/^(pending|queued|running|judging|compiling|waiting)$/.test(s))return 'pending';if(/error|fail/.test(s))return 'system-error';return 'unknown'}
function ranked(mode='history'){return (data?.teams??[]).filter(t=>!t.archived).map(t=>({...t,computed:totalScore(t.historical,data.tbest),bestSubmission:bestHistoricalSubmission(t,data.tbest)})).sort((a,b)=>mode==='history'?b.computed-a.computed||a.officialRank-b.officialRank:mode==='single'?(b.bestSubmission?.score??0)-(a.bestSubmission?.score??0)||a.officialRank-b.officialRank:a.officialRank-b.officialRank)}
function viewTimes(t,mode=view){return mode==='history'?t.historical:mode==='single'?(t.bestSubmission?.times??data.tbest.map(()=>null)):t.latest}
function ownerLabels(){const names=new Map(data.teams.map(t=>[t.id,t.name]));return resolveTbestOwners(data).map(o=>({...o,names:o.teamIds.map(id=>names.get(id)),label:o.teamIds.length?o.teamIds.map(id=>names.get(id)).join('、'):'未采集到归属'}))}
function ownerCell(owner){return `<span title="${esc(owner.label)}">${esc(owner.label)}</span>${owner.method==='observed-match'?'<small class="owner-method">历史耗时匹配</small>':owner.method==='official-submission'?'<small class="owner-method">官方提交标识</small>':''}`}
function rankChange(id){const change=data.changes,delta=change?.ranks?.[id]?.[view];if(delta===undefined||delta===0)return '';return `<small class="rank-change ${delta===null||delta>0?'green':'loss'}" title="${esc(date(change.at))} 相比 ${esc(date(change.since))} 的名次变化">${delta===null?'新':delta>0?'↑'+delta:'↓'+Math.abs(delta)}</small>`}
function filtered(){let teams=ranked(view).map((t,i)=>({...t,displayRank:i+1}));teams=teams.filter(t=>(!onlyFavorites||favoriteIds.has(t.id))&&(!query||[t.name,t.submitter].some(v=>String(v).toLowerCase().includes(query))));if(sortKey!=='score')teams.sort((a,b)=>{let d=sortKey==='name'?a.name.localeCompare(b.name,'zh-CN'):sortKey.startsWith('point')?(viewTimes(a)[Number(sortKey.slice(5))]??Infinity)-(viewTimes(b)[Number(sortKey.slice(5))]??Infinity):sortKey==='official'?a.officialScore-b.officialScore:Date.parse(a.submittedAt)-Date.parse(b.submittedAt);return ascending?d:-d});else if(ascending)teams.reverse();return teams}
function renderTable(){
 if(!data)return;
 const teams=filtered(),hist=view==='history',single=view==='single',recomputed=hist||single,best=data.tbest;
 $('#view-description').textContent=hist?'各队逐点历史最低有效耗时组合，按官方当前 TBest 重算；可来自不同提交。':single?'每次已采集的历史提交均按官方当前 TBest 重算，取该队最高分的一次；全部测试点来自同一次提交。':'与官方当前榜单一致：显示最新提交成绩与官方名次。';
 $('#result-count').textContent=`${teams.length} / ${ranked().length} 支队伍`;
 const head=(label,key,cls='')=>`<th class="${cls}"><button class="sort-head" data-sort="${key}" title="点击排序">${label}${sortKey===key?(ascending?' ↑':' ↓'):''}</button></th>`;
 $('#table-head').innerHTML=`<tr><th>排名</th>${head('队伍 / 最新提交者','name')}<th>最新状态</th>${head(hist?'逐点组合分':single?'最佳单次重算分':'官方分数','score','numeric')}${recomputed?head('官方分','official','numeric')+'<th class="numeric">分差</th>':''}<th>TBest</th>${data.tbest.map((_,i)=>head(`点 ${i+1}`,'point'+i,'numeric')).join('')}${single?'<th>所选历史提交</th>':head('最新提交','time')}</tr>`;
 const row=t=>{
  const times=viewTimes(t),bestCount=times.filter((v,i)=>validTime(v)&&validTime(best[i])&&v<=best[i]*1.000001).length,score=hist?t.computed:single?(t.bestSubmission?.score??0):t.officialScore;
  const submissionLabel=t.bestSubmission?.submittedAt?date(t.bestSubmission.submittedAt):t.bestSubmission?.observedAt?'采集于 '+date(t.bestSubmission.observedAt):'—';
  return `<tr data-row-team="${esc(t.id)}"><td><span class="rank ${t.displayRank<=3?'top':''}">${recomputed?t.displayRank:t.officialRank}</span>${rankChange(t.id)}</td><td class="team-cell"><button class="star ${favoriteIds.has(t.id)?'selected':''}" data-star="${esc(t.id)}" aria-label="${favoriteIds.has(t.id)?'取消关注':'关注'} ${esc(t.name)}">${favoriteIds.has(t.id)?'★':'☆'}</button><button data-team="${esc(t.id)}" title="查看 ${esc(t.name)} 详情">${esc(t.name)}</button><small>${esc(t.submitter)}</small></td><td><span class="status ${statusClass(t.status)}">${esc(t.status)}</span></td><td class="numeric score mono">${fmt(score)}</td>${recomputed?`<td class="numeric mono">${fmt(t.officialScore)}</td><td class="numeric delta mono">${score>=t.officialScore?'+':''}${fmt(score-t.officialScore)}</td>`:''}<td class="mono ${bestCount?'green':'muted'}">${bestCount} / ${data.tbest.length}</td>${times.map((v,i)=>`<td class="numeric mono time-cell ${validTime(v)&&validTime(best[i])&&v<=best[i]*1.000001?'best':''}">${time(v)}<small class="point-score" title="按官方当前 TBest 计算">${pointScore(v,best[i]).toFixed(1)} 分</small></td>`).join('')}<td class="mono muted time-cell">${single?submissionLabel:date(t.submittedAt)}</td></tr>`;
 };
 const pinned=ranked(view).map((t,i)=>({...t,displayRank:i+1})).filter(t=>pinnedIds.has(t.id));
 $('#pinned-body').innerHTML=pinned.map(t=>row(t).replace('<tr ', '<tr class="pinned-row" ').replace('<small>'+esc(t.submitter),'<span class="pin-badge">置顶</span><small>'+esc(t.submitter))).join('');
 $('#pin-teams').textContent=pinned.length?`↑ 置顶队伍 (${pinned.length})`:'↑ 置顶队伍';
 $('#table-body').innerHTML=teams.map(row).join('')||`<tr><td colspan="${data.tbest.length+(recomputed?8:6)}" class="empty">${onlyFavorites?'还没有匹配的关注队伍。点击队伍左侧 ☆ 添加关注。':'没有找到匹配的队伍'}</td></tr>`;
}
function renderPinPicker(){
 const q=$('#pin-search').value.trim().toLowerCase(),teams=ranked('official'),matches=teams.filter(t=>!q||[t.name,t.submitter].some(v=>String(v).toLowerCase().includes(q)));
 $('#pin-selection-count').textContent=`已选择 ${teams.filter(t=>pinnedIds.has(t.id)).length} 支队伍 · 勾选后立即保存`;
 $('#pin-list').innerHTML=matches.map(t=>`<label class="pin-option"><input type="checkbox" data-pin-id="${esc(t.id)}" ${pinnedIds.has(t.id)?'checked':''}><span><strong>${esc(t.name)}</strong><small>${esc(t.submitter)} · 官方 #${t.officialRank}</small></span></label>`).join('')||'<p class="muted">没有找到匹配的队伍</p>';
}
function freshness(){
 if(!data)return;
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.capturedAt))/1000)),interval=data.expectedIntervalSeconds??60;
 $('#updated').textContent=`更新于 ${date(data.capturedAt)} · ${age<60?age+' 秒':Math.floor(age/60)+' 分钟'}前`;
 const collector=cloudStatus??data.collector,stale=age>Math.max(60,interval*4),failed=!!collector?.lastError;
 $('#notice').classList.toggle('warning',stale||failed);
 const retry=collector?.nextAttemptAt&&collector.nextAttemptAt>Date.now()?`，约 ${Math.ceil((collector.nextAttemptAt-Date.now())/1000)} 秒后重试`:'';
 $('#notice').textContent=failed?`采集或同步异常：${collector.lastError}${retry}。保留最后有效数据；后台目标间隔 ${interval} 秒。`:stale?`数据已 ${age<120?age+' 秒':Math.floor(age/60)+' 分钟'}未更新，请查看采集状态。当前显示最后一次成功快照。`:`历史记录始于 ${date(data.startedAt)}（北京时间）· ${collector?.provider==='cloudflare'?'Cloudflare 云端':'后台'}目标每 ${interval} 秒采集。仅记录采集到的提交，采样间隔中的提交仍可能遗漏。`;
}
function render(){
 const r=ranked(),owners=ownerLabels();
 $('#stat-teams').textContent=r.length;$('#stat-pass').textContent=`${r.filter(t=>/^pass$/i.test(t.status)).length} 支队伍当前通过`;
 $('#stat-best').textContent=fmt(r[0]?.computed);$('#stat-leader').textContent=r[0]?.name??'等待数据';$('#stat-points').textContent=data.tbest.length;
 $('#stat-snapshots').textContent=data.snapshotCount??Math.max(0,...r.map(t=>t.observations??0));$('#stat-start').textContent=`始于 ${date(data.startedAt)}`;$('#history-count').textContent=r.length;
 $('#reference').innerHTML=data.tbest.map((t,i)=>`<div class="reference-item"><small>测试点 ${String(i+1).padStart(2,'0')}</small><strong>${time(t)}</strong><span class="reference-owner" title="${esc(owners[i].label)}">${esc(owners[i].label)}</span></div>`).join('');
 freshness();renderTable();analysis.renderChanges();if(selectedTeam&&$('#team-dialog').open)renderDetail(selectedTeam);
}
async function refresh(manual=false){
 if(busy||(!manual&&paused))return;busy=true;$('#refresh').disabled=true;$('#refresh').textContent='↻ 读取中…';
 try{
  let next,error;const previousAt=data?.capturedAt;
  if(cloudFeed){try{next=await cloudFeed.read();cloudStatus=next.collector}catch(e){error=e;cloudStatus={...(cloudStatus??{}),lastError:'云端数据同步失败'}}}
  const urls=location.hostname==='localhost'||location.hostname==='127.0.0.1'?['./data/latest.json',remote]:[remote,'./data/latest.json'];
  if(!next)for(const url of urls){try{const res=await fetch(`${url}?t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!res.ok)throw Error('HTTP '+res.status);const candidate=await res.json();if(candidate.schemaVersion!==1||!candidate.teams?.length||!candidate.tbest?.length||!Number.isFinite(Date.parse(candidate.capturedAt)))throw Error('无效快照');if(!next||Date.parse(candidate.capturedAt)>Date.parse(next.capturedAt))next=candidate;if(Date.now()-Date.parse(next.capturedAt)<=180000&&(!previousAt||Date.parse(next.capturedAt)>=Date.parse(previousAt)))break}catch(e){error=e}}
  if(!next)throw error;
  const newer=!previousAt||Date.parse(next.capturedAt)>Date.parse(previousAt);
  if(!data||newer){data=next;storage.set('cache',data);render()}else freshness();
  if(manual)toast(newer?`已更新到 ${date(data.capturedAt)} 的快照`:'已检查，暂无更新的快照');
 }catch(e){$('#notice').classList.add('warning');$('#notice').textContent=data?'同步失败，保留上次有效数据。请检查网络或稍后重试。':'暂时无法读取数据。首次采集可能尚未完成，请稍后刷新或查看采集状态。';if(manual)toast('同步失败，请稍后重试')}
 finally{busy=false;$('#refresh').disabled=false;$('#refresh').textContent='↻ 读取最新快照'}
}
function chartPoints(){const team=data?.teams?.find(t=>t.id===selectedTeam);return (team?.history??[]).filter(p=>Number.isFinite(Date.parse(p.at))&&Number.isFinite(p.computed)&&Number.isFinite(p.official))}
function chart(history){
 const h=history.filter(p=>Number.isFinite(Date.parse(p.at))&&Number.isFinite(p.computed)&&Number.isFinite(p.official));
 if(!h.length)return '<p class="detail-note">暂无有效趋势记录。</p>';
 let index=h.findIndex(p=>p.at===selectedChartAt);if(index<0)index=h.length-1;
 const selected=h[index],mobile=matchMedia('(max-width:700px)').matches;
 const W=mobile?Math.max(280,document.documentElement.clientWidth-74):900,H=mobile?228:240,L=35,R=14,TOP=20,B=28,plotW=W-L-R,plotH=H-TOP-B;
 const start=Date.parse(h[0].at),end=Math.max(start,Date.parse(data.capturedAt)),span=Math.max(1,end-start);
 const x=p=>L+(Date.parse(p.at)-start)/span*plotW,y=v=>TOP+(100-Math.max(0,Math.min(100,v)))/100*plotH;
 const plot=h.at(-1).at===data.capturedAt?h:[...h,{...h.at(-1),at:data.capturedAt}];
 const line=key=>plot.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
 const blue=line('computed'),grey=line('official'),tail=plot.at(-1),diff=selected.computed-selected.official;
 const label=p=>`${date(p.at)}，逐点组合分 ${fmt(p.computed)}，官方分 ${fmt(p.official)}`;
 return `<div class="chart-readout" role="status" aria-live="polite"><div class="chart-readout-time"><small>所选记录 · 北京时间</small><strong>${date(selected.at)}</strong><span>第 ${index+1} / ${h.length} 个变化点</span></div><div><small>逐点组合分</small><strong class="blue mono">${fmt(selected.computed)}</strong></div><div><small>官方分</small><strong class="mono">${fmt(selected.official)}</strong></div><div><small>分差</small><strong class="mono chart-difference">${diff>=0?'+':''}${fmt(diff)}</strong></div></div>
 <svg class="interactive-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="分数趋势，点击折线上的点查看分数" data-plot-left="${L}" data-plot-right="${W-R}" data-view-width="${W}"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--blue)" stop-opacity=".22"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>${[0,25,50,75,100].map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="5 5"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}<path d="${blue} L${x(tail)},${y(0)} L${x(h[0])},${y(0)} Z" fill="url(#area)"/><path d="${grey}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="6 6"/><path d="${blue}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linejoin="round"/>${h.map((p,i)=>`<g class="chart-point" role="button" tabindex="0" data-chart-index="${i}" aria-label="${esc(label(p))}" aria-pressed="${i===index}"><circle cx="${x(p)}" cy="${y(p.computed)}" r="12" fill="transparent"/><circle cx="${x(p)}" cy="${y(p.official)}" r="12" fill="transparent"/><circle class="computed-dot" cx="${x(p)}" cy="${y(p.computed)}" r="${i===index?5:3}" fill="var(--blue)" stroke="var(--surface)" stroke-width="1.5"/><circle cx="${x(p)}" cy="${y(p.official)}" r="${i===index?4.5:2.5}" fill="var(--muted)" stroke="var(--surface)" stroke-width="1.5"/><title>${esc(label(p))}</title></g>`).join('')}<line x1="${x(selected)}" x2="${x(selected)}" y1="${TOP}" y2="${y(0)}" stroke="var(--blue)" stroke-dasharray="3 5" opacity=".5" pointer-events="none"/><circle cx="${x(selected)}" cy="${y(selected.computed)}" r="8" fill="none" stroke="var(--blue)" opacity=".4" pointer-events="none"/><text x="${L}" y="${H-5}">${date(h[0].at,true)}</text><text x="${W-R}" y="${H-5}" text-anchor="end">${date(data.capturedAt,true)}</text></svg>
 <div class="chart-controls"><button class="button" data-chart-step="-1" ${index===0?'disabled':''} aria-label="上一个趋势点">← 上一点</button><label class="chart-slider"><span class="sr-only">选择趋势点</span><input type="range" min="0" max="${Math.max(0,h.length-1)}" value="${index}" ${h.length===1?'disabled':''} aria-label="选择趋势点" aria-valuetext="${esc(label(selected))}"></label><button class="button" data-chart-step="1" ${index===h.length-1?'disabled':''} aria-label="下一个趋势点">下一点 →</button></div><p class="chart-help">点击折线上的点查看分数，也可用滑块或左右键逐点查看。历史分数按当时 TBest 计算。</p>`;
}
function chooseChartPoint(index,focusPoint=false){
 const h=chartPoints();if(!h.length)return;
 const i=Math.max(0,Math.min(h.length-1,index));selectedChartAt=h[i].at;
 const container=$('.chart-interactive');if(!container)return;
 const next=document.createElement('div');next.innerHTML=chart(h);
 container.querySelector('.chart-readout').replaceWith(next.querySelector('.chart-readout'));
 container.querySelector('.interactive-chart').replaceWith(next.querySelector('.interactive-chart'));
 const slider=container.querySelector('.chart-slider input'),nextSlider=next.querySelector('.chart-slider input');
 slider.value=String(i);slider.setAttribute('aria-valuetext',nextSlider.getAttribute('aria-valuetext'));
 container.querySelectorAll('[data-chart-step]').forEach(button=>button.disabled=next.querySelector(`[data-chart-step="${button.dataset.chartStep}"]`).disabled);
 if(focusPoint)container.querySelector(`[data-chart-index="${i}"]`)?.focus();
}
function renderDetail(id){
 const mode=view==='single'?'single':'history',r=ranked(mode),t=r.find(t=>t.id===id);if(!t)return;
 const single=mode==='single',times=viewTimes(t,mode),score=single?(t.bestSubmission?.score??0):t.computed,rank=r.findIndex(x=>x.id===id)+1,diff=score-t.officialScore,owners=ownerLabels();
 const bestCount=times.filter((v,i)=>validTime(v)&&v<=data.tbest[i]*1.000001).length;
 $('#detail-title').textContent=t.name;
 $('#detail-subtitle').innerHTML=`<span class="status ${statusClass(t.status)}">${esc(t.status)}</span> &nbsp; 最新提交者 ${esc(t.submitter)} · ${date(t.submittedAt)} · ${t.observations??1} 次采集`;
 const chosen=t.bestSubmission;
 const chosenInfo=single?`<p class="submission-info">所选历史提交：${chosen?.submittedAt?date(chosen.submittedAt):chosen?.observedAt?'采集于 '+date(chosen.observedAt):'未记录时间'} · ${chosen?.submissionId?'ID '+esc(chosen.submissionId):'旧快照未记录提交 ID'}<br>全部测试点来自这一份提交，按官方当前 TBest 重新计分。</p>`:'';
 const trend=single?'':`<h3 class="detail-section-title">趋势 <span>${t.history.length} 个变化点</span></h3><div class="chart-box"><div class="chart-legend"><span><i></i>逐点组合分</span><span><i class="dashed"></i>官方分</span></div><div class="chart-interactive">${chart(t.history)}</div></div>`;
 $('#detail-content').innerHTML=`<div class="detail-analysis-actions"><a class="button" href="./team.html?team=${encodeURIComponent(id)}">队伍战报 ↗</a><a class="button" href="./submissions.html?team=${encodeURIComponent(id)}">提交记录 ↗</a><button class="button" data-analysis="scenario" data-analysis-team="${esc(id)}">ϟ 模拟此队优化</button><button class="button" data-analysis="submissions" data-analysis-team="${esc(id)}">◷ 对比历史提交</button></div><h3 class="detail-section-title">${single?'最佳单次历史提交':'逐点历史最优组合'}</h3><div class="detail-stats"><div class="detail-stat"><small>排名（重算 / 官）</small><strong>#${rank}<span class="muted" style="font-size:18px"> / #${t.officialRank}</span></strong></div><div class="detail-stat"><small>${single?'单次提交重算分':'逐点组合分'}</small><strong class="blue">${fmt(score)}</strong></div><div class="detail-stat"><small>官方当前分</small><strong>${fmt(t.officialScore)}</strong></div><div class="detail-stat"><small>分差</small><strong style="color:var(--orange)">${diff>=0?'+':''}${fmt(diff)}</strong></div></div>${chosenInfo}${trend}<h3 class="detail-section-title">逐点明细 <span style="color:var(--green)">TBest × ${bestCount}</span></h3><div class="detail-table"><table><thead><tr><th>点</th><th class="numeric">${single?'所选历史提交':'历史最好'}</th><th class="numeric">本队最新</th><th class="numeric">官方 TBest</th><th>TBest 队伍</th><th class="numeric">t / T</th><th class="numeric">得分</th><th class="numeric">差距</th></tr></thead><tbody>${data.tbest.map((T,i)=>{const t0=times[i],s=pointScore(t0,T),best=validTime(t0)&&t0<=T*1.000001;return `<tr><td class="point-name">点${i+1}</td><td class="numeric mono ${best?'green':''}" style="font-weight:700">${time(t0)}</td><td class="numeric mono">${time(t.latest[i])}</td><td class="numeric mono muted">${time(T)}</td><td class="baseline-team">${ownerCell(owners[i])}</td><td class="numeric mono">${validTime(t0)?(t0/T).toFixed(2)+'×':'—'}</td><td class="numeric mono"><span class="mini-bar"><i class="${best?'best':''}" style="width:${s}%"></i></span>${s.toFixed(1)}</td><td class="numeric mono ${best?'green':'muted'}">${best?(t0<T*.999999?'参考变化':'TBest'):validTime(t0)?'+'+time(t0-T):'—'}</td></tr>`}).join('')}</tbody></table></div><p class="detail-note">${single?'逐次重算监控期间采集到的历史提交，选择当前得分最高的一次；没有拼接不同提交的测试点。':'历史最好取监控期间每点最低有效耗时，可能组合多次提交。趋势保留当时的官方 TBest 与得分。'}<br>TBest 队伍优先按官方提交标识核对；“历史耗时匹配”表示采集记录中出现过与官方 TBest 相同的原始耗时，不代表官方唯一归属。未匹配到时显示“未采集到归属”。启动前或采集间隔内遗漏的提交不在本系统历史范围内。</p>`;
}
function showTeam(id){if(selectedTeam!==id)selectedChartAt=null;selectedTeam=id;renderDetail(id);if(!$('#team-dialog').open)$('#team-dialog').showModal();location.hash='team='+encodeURIComponent(id)}
const analysis=initAnalysis({getData:()=>data,getView:()=>view,getPinned:()=>[...pinnedIds],esc,fmt,time,date,toast});
function pollStatus(){const remaining=Math.max(0,Math.ceil((nextCheckAt-Date.now())/1000));$('#poll-status').textContent=paused?'自动检查已暂停（后台采集继续）':document.hidden?'页面在后台 · 返回后检查':busy?'正在检查最新快照…':`下次检查 ${remaining} 秒 · 后台目标每 ${data?.expectedIntervalSeconds??15} 秒采集`}
$('#theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('cann-monitor:theme',theme)}catch{};document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d111b':'#f6f8fc'});
$('#refresh').addEventListener('click',()=>refresh(true));$('#pause').addEventListener('click',()=>{paused=!paused;$('#pause').textContent=paused?'▷ 恢复刷新':'Ⅱ 暂停刷新';$('#pause').setAttribute('aria-pressed',paused);pollStatus();if(!paused){nextCheckAt=Date.now()+15000;refresh()}});
$('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderTable()});$('#favorites').addEventListener('click',()=>{onlyFavorites=!onlyFavorites;$('#favorites').setAttribute('aria-pressed',onlyFavorites);renderTable()});
$('#pin-teams').addEventListener('click',()=>{if(!data){toast('请等待榜单加载');return}$('#pin-search').value='';renderPinPicker();$('#pin-dialog').showModal()});
$('#pin-search').addEventListener('input',renderPinPicker);
$('#pin-list').addEventListener('change',e=>{const input=e.target.closest('[data-pin-id]');if(!input)return;input.checked?pinnedIds.add(input.dataset.pinId):pinnedIds.delete(input.dataset.pinId);storage.set('pinned-teams',[...pinnedIds]);renderTable();renderPinPicker()});
$('#clear-pins').addEventListener('click',()=>{pinnedIds.clear();storage.set('pinned-teams',[]);renderTable();renderPinPicker()});
$('#close-pins').addEventListener('click',()=>$('#pin-dialog').close());
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;sortKey='score';ascending=false;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',b===button)});renderTable();analysis.renderChanges()}));
$('#ranking').addEventListener('click',e=>{const star=e.target.closest('[data-star]'),team=e.target.closest('[data-team]'),sort=e.target.closest('[data-sort]');if(star){const id=star.dataset.star;favoriteIds.has(id)?favoriteIds.delete(id):favoriteIds.add(id);storage.set('favorites',[...favoriteIds]);renderTable()}else if(team)showTeam(team.dataset.team);else if(sort){if(sortKey===sort.dataset.sort)ascending=!ascending;else{sortKey=sort.dataset.sort;ascending=sortKey==='name'||sortKey.startsWith('point')}renderTable()}});
$('#detail-content').addEventListener('click',e=>{
 const point=e.target.closest('[data-chart-index]'),step=e.target.closest('[data-chart-step]'),svg=e.target.closest('.interactive-chart');
 if(point){chooseChartPoint(Number(point.dataset.chartIndex));return}
 const h=chartPoints();if(!h.length)return;
 let i=h.findIndex(p=>p.at===selectedChartAt);if(i<0)i=h.length-1;
 if(step){chooseChartPoint(i+Number(step.dataset.chartStep));return}
 if(svg){const rect=svg.getBoundingClientRect(),viewX=(e.clientX-rect.left)/rect.width*Number(svg.dataset.viewWidth),ratio=Math.max(0,Math.min(1,(viewX-Number(svg.dataset.plotLeft))/(Number(svg.dataset.plotRight)-Number(svg.dataset.plotLeft))));const start=Date.parse(h[0].at),end=Math.max(start,Date.parse(data.capturedAt)),at=start+ratio*(end-start);chooseChartPoint(h.reduce((nearest,p,j)=>Math.abs(Date.parse(p.at)-at)<Math.abs(Date.parse(h[nearest].at)-at)?j:nearest,0))}
});
$('#detail-content').addEventListener('keydown',e=>{
 const point=e.target.closest('[data-chart-index]');if(!point)return;
 const i=Number(point.dataset.chartIndex),last=chartPoints().length-1;
 const next=({'ArrowLeft':i-1,'ArrowRight':i+1,'Home':0,'End':last,'Enter':i,' ':i})[e.key];
 if(next!==undefined){e.preventDefault();chooseChartPoint(next,true)}
});
$('#detail-content').addEventListener('input',e=>{if(e.target.matches('.chart-slider input'))chooseChartPoint(Number(e.target.value))});
window.addEventListener('resize',()=>{if($('#team-dialog').open&&$('.chart-interactive')){const h=chartPoints(),i=h.findIndex(p=>p.at===selectedChartAt);chooseChartPoint(i<0?h.length-1:i)}});
$('#close-dialog').addEventListener('click',()=>$('#team-dialog').close());$('#team-dialog').addEventListener('click',e=>{if(e.target===$('#team-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});$('#team-dialog').addEventListener('close',()=>{selectedTeam=null;history.replaceState(null,'',location.pathname+location.search)});
$('#export').addEventListener('click',()=>{
 if(!data){toast('暂无可导出数据');return}
 const best=data.tbest,owners=ownerLabels();
 const headers=['排名','队伍','提交者','最新状态','逐点组合分','最佳单次历史分','官方分','所选历史提交ID','所选历史提交时间','所选历史提交采集时间',...data.tbest.flatMap((_,i)=>[`点${i+1}耗时(μs)`,`点${i+1}官方TBest(μs)`,`点${i+1}得分`,`点${i+1}TBest队伍`,`点${i+1}归属依据`]),'最新提交时间(北京时间)'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const rows=filtered().map(t=>{const times=viewTimes(t),s=t.bestSubmission;return [view==='official'?t.officialRank:t.displayRank,t.name,t.submitter,t.status,fmt(t.computed),fmt(s?.score??0),fmt(t.officialScore),s?.submissionId??'',s?.submittedAt?date(s.submittedAt):'',s?.observedAt?date(s.observedAt):'',...best.flatMap((T,i)=>[times[i],T,pointScore(times[i],T),owners[i].label,owners[i].method]),date(t.submittedAt)]});
 const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cann-${view}-${new Date(data.capturedAt).toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选结果及逐点基准分')
});
data=storage.get('cache',null);if(data?.schemaVersion===1&&data.teams?.length)render();else data=null;
try{const config=await fetch('./data-source.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(6000)}).then(r=>r.json());if(config.cloudflareEndpoint&&/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(config.cloudflareEndpoint)){cloudEndpoint=config.cloudflareEndpoint;cloudFeed=createFeedClient(cloudEndpoint,{cache:storage.get('cloud-feed',null),save:state=>storage.set('cloud-feed',state)})}}catch{}
await refresh();const match=location.hash.match(/^#team=(.+)$/);if(match&&data)showTeam(decodeURIComponent(match[1]));nextCheckAt=Date.now()+15000;pollStatus();setInterval(()=>{freshness();nextCheckAt=Date.now()+15000;if(!document.hidden)refresh();pollStatus()},15000);setInterval(pollStatus,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){nextCheckAt=Date.now()+15000;refresh()}pollStatus()});
