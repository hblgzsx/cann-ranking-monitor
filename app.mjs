import {setCaseCatalog} from './lib/case-display.mjs?v=20261125-case-display';
import {liveData} from './lib/live-data.mjs?v=20261126-backfill';
import {referenceNotice,incompleteStatus} from './lib/case-evolution.mjs?v=20261124-cases';
import {prefixData,initTeamPrefixes,teamInSelectedRegion} from './lib/team-prefix-ui.mjs?v=20261122-regions';
import {installIcons} from './lib/icons.mjs';
installIcons();
import {pointScore,validTime,resolveTbestOwners} from './lib/scoring.mjs?v=20261124-metadata';
import {initAnalysis} from './lib/analysis-ui.mjs?v=20261124-audit';
import {rankTeams,rankingExport,compareRankingRows,reachesReference} from './lib/analytics.mjs?v=20261124-audit';
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
function statusClass(status){const s=String(status).trim().toLowerCase();if(incompleteStatus(s))return 'pending';if(s==='pass')return 'pass';if(s==='wrong answer')return 'wrong-answer';if(s==='runtime error')return 'runtime-error';if(s==='compile error')return 'compile-error';if(s==='time limit exceeded'||s==='timeout')return 'time-limit';if(s==='memory limit exceeded')return 'memory-limit';if(s==='output limit exceeded')return 'output-limit';if(/^(pending|queued|running|judging|compiling|waiting|unjudged)$/.test(s))return 'pending';if(/error|fail/.test(s))return 'system-error';return 'unknown'}
function ranked(mode='history'){return data?rankTeams(data,mode):[]}
function ownerLabels(){const names=new Map(data.teams.map(t=>[t.id,t.name]));return resolveTbestOwners(data).map(o=>({...o,names:o.teamIds.map(id=>names.get(id)),label:o.teamIds.length?o.teamIds.map(id=>names.get(id)).join('、'):'未采集到归属'}))}
function ownerCell(owner){return `<span title="${esc(owner.label)}">${esc(owner.label)}</span>${owner.method==='observed-match'?'<small class="owner-method">历史耗时匹配</small>':owner.method==='official-submission'?'<small class="owner-method">官方提交标识</small>':''}`}
function rankChange(id){const change=data.changes,delta=change?.ranks?.[id]?.[view];if(delta===undefined||delta===0)return '';return `<small class="rank-change ${delta===null||delta>0?'green':'loss'}" title="${esc(date(change.at))} 相比 ${esc(date(change.since))} 的名次变化">${delta===null?'新':delta>0?'↑'+delta:'↓'+Math.abs(delta)}</small>`}
function filtered(){
 let teams=ranked(view).map(t=>({...t,displayRank:t.rank}));
 teams=teams.filter(t=>teamInSelectedRegion(t.id)&&(!onlyFavorites||favoriteIds.has(t.id))&&(!query||[t.name,t.metadata?.submitter].some(v=>String(v??'').toLowerCase().includes(query))));
 if(sortKey!=='score')teams.sort((a,b)=>compareRankingRows(a,b,sortKey,ascending));else if(ascending)teams.reverse();return teams;
}
function renderTable(){
 if(!data)return;
 const teams=filtered(),hist=view==='history',single=view==='single',best=data.tbest;
 $('#view-description').textContent=hist?'各队逐点历史最低有效耗时组合，按当前 TBest 重算；可来自不同提交，不对应单一提交人、状态或时间。':single?'每份已采集历史提交按当前 TBest 重算，取最高分的一份；提交人、状态、时间和耗时均来自该提交。缺失或未通过的点计 0 分。':'按官方名次及官方分展示最新榜单提交；每个 case 的分数是按当前 TBest 重算的分析值，算术平均值可能与官方分不同。';
 $('#result-count').textContent=`${teams.length} / ${ranked().length} 支队伍`;
 $('#search').placeholder=hist?'搜索队伍':'搜索队伍 / 对应提交人';$('#search').setAttribute('aria-label',$('#search').placeholder);
 const head=(label,key,cls='')=>`<th class="${cls}"><button class="sort-head" data-sort="${key}" title="点击排序">${label}${sortKey===key?(ascending?' ↑':' ↓'):''}</button></th>`;
 const count=best.length+(hist?5:6);
 $('#table-head').innerHTML=`<tr><th>${view==='official'?'官方排名':'排名'}</th>${head(hist?'队伍':single?'队伍 / 所选提交人':'队伍 / 最新提交人','name')}<th>${hist?'有效点':single?'所选提交状态':'最新状态'}</th>${head(hist?'逐点组合分':single?'最佳单次重算分':'官方分','score','numeric')}<th>TBest</th>${best.map((_,i)=>head(`点 ${i+1}`,'point'+i,'numeric')).join('')}${hist?'':single?'<th>所选历史提交 ID / 时间</th>':head('最新提交 ID / 时间','time')}</tr>`;
 $('#reference-body').innerHTML=`<tr class="ranking-reference-row"><th colspan="2"><strong>TBest</strong><small>当前参考耗时</small></th><td>${best.filter(validTime).length} / ${best.length}</td><td class="numeric muted">—</td><td class="mono">${best.length} 点</td>${best.map((T,i)=>`<td class="numeric mono"><strong>${time(T)}</strong><small>${data.tbestStatus?.[i]==='retained'?'保留参考 · 暂估':validTime(T)?'参考分 100':'等待参考'}</small></td>`).join('')}${hist?'':'<td class="muted">—</td>'}</tr>`;
 const row=(t,pinned=false)=>{
  const metadata=t.metadata,submissionTime=metadata?.submittedAt?'提交 '+date(metadata.submittedAt):metadata?.observedAt?'首次采集 '+date(metadata.observedAt):'时间未记录';
  return `<tr ${pinned?'class="pinned-row" ':''}data-row-team="${esc(t.id)}"><td><span class="rank ${t.rank<=3?'top':''}">${t.rank}</span>${rankChange(t.id)}</td><td class="team-cell"><button class="star ${favoriteIds.has(t.id)?'selected':''}" data-star="${esc(t.id)}" aria-label="${favoriteIds.has(t.id)?'取消关注':'关注'} ${esc(t.name)}">${favoriteIds.has(t.id)?'★':'☆'}</button><button data-team="${esc(t.id)}" title="查看 ${esc(t.name)} 详情">${esc(t.name)}</button>${pinned?'<span class="pin-badge">置顶</span>':''}${hist?'':`<small>${esc(metadata?.submitter||'未记录')}</small>`}</td><td>${hist?`<span class="mono">${t.validCount} / ${best.length}</span>`:`<span class="status ${statusClass(metadata?.status)}">${esc(metadata?.status??'状态未记录')}</span><small class="coverage-note">有效点 ${t.validCount} / ${best.length}</small>`}</td><td class="numeric score mono">${fmt(t.viewScore)}</td><td class="mono ${t.bestCount?'green':'muted'}">${t.bestCount} / ${best.length}</td>${t.times.map((v,i)=>`<td class="numeric mono time-cell ${reachesReference(v,best[i])?'best':''}">${time(v)}<small class="point-score" title="按当前 TBest 重算的分析值">${pointScore(v,best[i]).toFixed(1)} 分</small></td>`).join('')}${hist?'':`<td class="ranking-submission mono muted"><span class="ranking-submission-id">${esc(metadata?.submissionId||(single&&!t.bestSubmission?'暂无已采集提交':'无 ID · 旧快照'))}</span><small class="ranking-submission-time">${submissionTime}</small></td>`}</tr>`;
 };
 const pinned=ranked(view).filter(t=>pinnedIds.has(t.id)&&teamInSelectedRegion(t.id));
 $('#pinned-body').innerHTML=pinned.map(t=>row(t,true)).join('');
 $('#pin-teams').textContent=pinned.length?`↑ 置顶队伍 (${pinned.length})`:'↑ 置顶队伍';
 $('#table-body').innerHTML=teams.map(t=>row(t)).join('')||`<tr><td colspan="${count}" class="empty">${onlyFavorites?'还没有匹配的关注队伍。点击队伍左侧 ☆ 添加关注。':'没有找到匹配的队伍'}</td></tr>`;
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
 $('#notice').textContent+=' '+referenceNotice(data);
}
function render(){setCaseCatalog(data?.testcaseIds);
 data=prefixData(data);
 const r=ranked(),owners=ownerLabels();
 $('#stat-teams').textContent=r.length;$('#stat-pass').textContent=`${r.filter(t=>/^pass$/i.test(t.status)).length} 支队伍当前通过`;
 $('#stat-best').textContent=fmt(r[0]?.computed);$('#stat-leader').textContent=r[0]?.name??'等待数据';$('#stat-points').textContent=data.tbest.length;
 $('#stat-snapshots').textContent=data.snapshotCount??Math.max(0,...r.map(t=>t.observations??0));$('#stat-start').textContent=`始于 ${date(data.startedAt)}`;$('#history-count').textContent=r.length;
 $('#reference').innerHTML=data.tbest.map((t,i)=>`<div class="reference-item"><small>测试点 ${String(i+1).padStart(2,'0')}</small><strong>${time(t)}</strong>${data.tbestStatus?.[i]==='retained'?`<small title="最后确认 ${date(data.tbestLastValidAt?.[i])}">保留参考 · 暂估</small>`:!validTime(t)?'<small>等待官方 TBest</small>':''}<span class="reference-owner" title="${esc(owners[i].label)}">${esc(owners[i].label)}</span></div>`).join('');
 freshness();renderTable();analysis.renderChanges();if(selectedTeam&&$('#team-dialog').open)renderDetail(selectedTeam);
}
async function refresh(manual=false){
 if(busy||(!manual&&paused))return;busy=true;$('#refresh').disabled=true;$('#refresh').textContent='↻ 读取中…';
 try{
  let next,error;const previousAt=data?.capturedAt;
  if(cloudFeed){try{next=await cloudFeed.read({force:manual});cloudStatus=next.connection?.mode==='backup'?{...next.collector,lastError:'实时连接暂未成功：'+next.connection.message+'；当前显示已保存数据，稍后自动重试'}:next.collector}catch(e){error=e;cloudStatus={...(cloudStatus??{}),lastError:e.message??'云端数据同步失败'}}}
  if(!next)throw error;
  const newer=!previousAt||Date.parse(next.capturedAt)>Date.parse(previousAt);
  if(!data||newer){data=next;render()}else{data.connection=next.connection;freshness()}
  if(manual)toast(next.connection?.mode==='backup'?`实时连接未成功，显示备用快照 ${date(data.capturedAt)}`:newer?`已更新到 ${date(data.capturedAt)} 的快照`:'实时连接正常，暂无更新的快照');
 }catch(e){$('#notice').classList.add('warning');$('#notice').textContent=data?'同步失败，保留上次有效数据。请检查网络或稍后重试。':'暂时无法读取数据。首次采集可能尚未完成，请稍后刷新或查看采集状态。';if(manual)toast('同步失败，请稍后重试')}
 finally{busy=false;$('#refresh').disabled=false;$('#refresh').textContent='↻ 读取最新快照'}
}
function chartPoints(){const team=data?.teams?.find(t=>t.id===selectedTeam);return (team?.history??[]).filter(p=>Number.isFinite(Date.parse(p.at))&&Number.isFinite(p.computed))}
function chart(history){
 const h=history.filter(p=>Number.isFinite(Date.parse(p.at))&&Number.isFinite(p.computed));
 if(!h.length)return '<p class="detail-note">暂无有效趋势记录。</p>';
 let index=h.findIndex(p=>p.at===selectedChartAt);if(index<0)index=h.length-1;
 const selected=h[index],mobile=matchMedia('(max-width:700px)').matches;
 const W=mobile?Math.max(280,document.documentElement.clientWidth-74):900,H=mobile?228:240,L=35,R=14,TOP=20,B=28,plotW=W-L-R,plotH=H-TOP-B;
 const start=Date.parse(h[0].at),end=Math.max(start,Date.parse(data.capturedAt)),span=Math.max(1,end-start);
 const x=p=>L+(Date.parse(p.at)-start)/span*plotW,y=v=>TOP+(100-Math.max(0,Math.min(100,v)))/100*plotH;
 const plot=h.at(-1).at===data.capturedAt?h:[...h,{...h.at(-1),at:data.capturedAt}];
 const line=key=>plot.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
 const blue=line('computed'),tail=plot.at(-1);
 const label=p=>`${date(p.at)}，逐点组合分 ${fmt(p.computed)}`;
 return `<div class="chart-readout" role="status" aria-live="polite"><div class="chart-readout-time"><small>所选记录 · 北京时间</small><strong>${date(selected.at)}</strong><span>第 ${index+1} / ${h.length} 个变化点</span></div><div><small>逐点组合分</small><strong class="blue mono">${fmt(selected.computed)}</strong></div></div>
 <svg class="interactive-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="分数趋势，点击折线上的点查看分数" data-plot-left="${L}" data-plot-right="${W-R}" data-view-width="${W}"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--blue)" stop-opacity=".22"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>${[0,25,50,75,100].map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="5 5"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}<path d="${blue} L${x(tail)},${y(0)} L${x(h[0])},${y(0)} Z" fill="url(#area)"/><path d="${blue}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linejoin="round"/>${h.map((p,i)=>`<g class="chart-point" role="button" tabindex="0" data-chart-index="${i}" aria-label="${esc(label(p))}" aria-pressed="${i===index}"><circle cx="${x(p)}" cy="${y(p.computed)}" r="12" fill="transparent"/><circle class="computed-dot" cx="${x(p)}" cy="${y(p.computed)}" r="${i===index?5:3}" fill="var(--blue)" stroke="var(--surface)" stroke-width="1.5"/><title>${esc(label(p))}</title></g>`).join('')}<line x1="${x(selected)}" x2="${x(selected)}" y1="${TOP}" y2="${y(0)}" stroke="var(--blue)" stroke-dasharray="3 5" opacity=".5" pointer-events="none"/><circle cx="${x(selected)}" cy="${y(selected.computed)}" r="8" fill="none" stroke="var(--blue)" opacity=".4" pointer-events="none"/><text x="${L}" y="${H-5}">${date(h[0].at,true)}</text><text x="${W-R}" y="${H-5}" text-anchor="end">${date(data.capturedAt,true)}</text></svg>
 <div class="chart-controls"><button class="button" data-chart-step="-1" ${index===0?'disabled':''} aria-label="上一个趋势点">← 上一点</button><label class="chart-slider"><span class="sr-only">选择趋势点</span><input type="range" min="0" max="${Math.max(0,h.length-1)}" value="${index}" ${h.length===1?'disabled':''} aria-label="选择趋势点" aria-valuetext="${esc(label(selected))}"></label><button class="button" data-chart-step="1" ${index===h.length-1?'disabled':''} aria-label="下一个趋势点">下一点 →</button></div><p class="chart-help">点击折线上的点查看分数，也可用滑块或左右键逐点查看。轨迹按当时公开的 case 和当时 TBest 计算，不与最新提交官方分比较。</p>`;
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
 const mode=view,t=ranked(mode).find(t=>t.id===id);if(!t)return;
 const hist=mode==='history',single=mode==='single',official=mode==='official',times=t.times,metadata=t.metadata,owners=ownerLabels();
 $('#detail-title').textContent=t.name;
 $('#detail-subtitle').innerHTML=hist?'逐点历史最优组合 · 可以来自多份提交':`<span class="status ${statusClass(metadata?.status)}">${esc(metadata?.status??'状态未记录')}</span> &nbsp; ${single?'所选':'最新'}提交人：${esc(metadata?.submitter||'未记录')}`;
 const identity=hist?'<p class="submission-info">组合榜没有唯一的提交 ID、提交时间或整体评测状态。每点来源可在队伍战报中查看。</p>':`<p class="submission-info"><span class="ranking-submission-id">提交 ID：${esc(metadata?.submissionId||'未记录')}</span><span class="ranking-submission-time">${metadata?.submittedAt?'实际提交 '+date(metadata.submittedAt):metadata?.observedAt?'首次采集 '+date(metadata.observedAt):'时间未记录'}</span></p>`;
 const cards=[[official?'官方名次':'当前重算排名','#'+t.rank],[hist?'逐点组合分':single?'最佳单次重算分':'官方分',fmt(t.viewScore)],['有效点',t.validCount+' / '+data.tbest.length],[official?'当前 TBest 重算（分析值）':'达到 TBest 的点',official?fmt(t.analysisScore):t.bestCount+' / '+data.tbest.length]];
 const trend=hist?`<h3 class="detail-section-title">组合分采集轨迹 <span>${t.history?.length??0} 个变化点</span></h3><div class="chart-box"><div class="chart-legend"><span><i></i>当时组合分</span></div><div class="chart-interactive">${chart(t.history??[])}</div></div>`:'';
 const reportQuery='team='+encodeURIComponent(id)+(single&&metadata?.submissionId?'&submission='+encodeURIComponent(metadata.submissionId):'');
 $('#detail-content').innerHTML=`<div class="detail-analysis-actions"><a class="button" href="./team.html?${reportQuery}">队伍战报 ↗</a><a class="button" href="./submissions.html?team=${encodeURIComponent(id)}">提交记录 ↗</a><button class="button" data-analysis="scenario" data-analysis-team="${esc(id)}">ϟ 模拟此队优化</button><button class="button" data-analysis="submissions" data-analysis-team="${esc(id)}">◷ 对比历史提交</button></div><h3 class="detail-section-title">${hist?'逐点历史最优组合':single?'最佳单次历史提交':'官方当前榜单提交'}</h3><div class="detail-stats">${cards.map(([label,value])=>`<div class="detail-stat"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>${identity}${trend}<h3 class="detail-section-title">逐点明细 <span class="green">TBest × ${t.bestCount}</span></h3><div class="detail-table"><table><thead><tr><th>点</th><th class="numeric">${hist?'组合最低耗时':single?'所选历史提交耗时':'本次有效耗时'}</th><th class="numeric">当前 TBest</th><th>TBest 队伍</th><th class="numeric">t / T</th><th class="numeric">重算得分</th><th class="numeric">与参考差距</th></tr></thead><tbody>${data.tbest.map((T,i)=>{const value=times[i],s=pointScore(value,T),best=reachesReference(value,T),comparable=validTime(value)&&validTime(T);return `<tr><th>点 ${i+1}</th><td class="numeric mono ${best?'green':''}">${time(value)}</td><td class="numeric mono muted">${time(T)}</td><td class="baseline-team">${ownerCell(owners[i])}</td><td class="numeric mono">${comparable?(value/T).toFixed(2)+'×':'—'}</td><td class="numeric mono"><span class="mini-bar"><i class="${best?'best':''}" style="width:${s}%"></i></span>${s.toFixed(1)}</td><td class="numeric mono ${best?'green':'muted'}">${!comparable?'—':best?(value<T*.999999?'参考变化':'TBest'):'+'+time(value-T)}</td></tr>`}).join('')}</tbody></table></div><p class="detail-note">${hist?'每点取已采集历史最低有效耗时，可以跨提交组合。轨迹中的分数使用当时公开的 case 和当时 TBest。':single?'全部测试点来自同一份已采集提交，统一按当前 TBest 重算；缺失或未通过的点计 0 分。':'官方分及名次来自当前公开榜单；逐点分与分析总分按当前 TBest 重算，仅供分析，不用于改变官方名次。'}<br>TBest 归属优先核对官方提交 ID；耗时匹配不代表唯一归属。未知来源不推测。</p>`;
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
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;sortKey='score';ascending=false;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',b===button)});renderTable();analysis.renderChanges();if(selectedTeam)renderDetail(selectedTeam)}));
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
 const {headers,rows}=rankingExport(data,view,filtered(),{date});
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cann-${view}-${new Date(data.capturedAt).toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选结果及逐点基准分')
});
initTeamPrefixes({getData:()=>data,onChange:()=>{if(data)render()}});
cloudFeed=await liveData();data=cloudFeed.cached;if(data)render();
await refresh();const match=location.hash.match(/^#team=(.+)$/);if(match&&data)showTeam(decodeURIComponent(match[1]));nextCheckAt=Date.now()+15000;pollStatus();setInterval(()=>{freshness();nextCheckAt=Date.now()+15000;if(!document.hidden)refresh();pollStatus()},15000);setInterval(pollStatus,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){nextCheckAt=Date.now()+15000;refresh()}pollStatus()});
