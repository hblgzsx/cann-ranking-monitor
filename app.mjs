import {pointScore,totalScore,validTime,bestHistoricalSubmission,resolveTbestOwners} from './lib/scoring.mjs?v=20261121-history';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k,f){try{return JSON.parse(localStorage.getItem('cann-monitor:'+k))??f}catch{return f}},set(k,v){try{localStorage.setItem('cann-monitor:'+k,JSON.stringify(v))}catch{}}};
let data=null,view='history',paused=false,busy=false,query='',onlyFavorites=false,sortKey='score',ascending=false,selectedTeam=null,toastTimer;
const favoriteIds=new Set(storage.get('favorites',[]));
const pinnedIds=new Set(storage.get('pinned-teams',[]));
const remote='https://raw.githubusercontent.com/hblgzsx/cann-ranking-monitor/data/latest.json';
const fmt=n=>Number.isFinite(n)?(Math.abs(n)<.005?'0.00':n.toFixed(2)):'—';
function time(t){if(!validTime(t))return '—';return t>=1e6?(t/1e6).toFixed(2)+' s':t>=1000?(t/1000).toFixed(2)+' ms':t.toFixed(2)+' μs'}
function date(t,short=false){const d=new Date(t);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',...(short?{}:{month:'2-digit',day:'2-digit'}),hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)}
function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function statusClass(status){const s=String(status).trim().toLowerCase();if(s==='pass')return 'pass';if(s==='wrong answer')return 'wrong-answer';if(s==='runtime error')return 'runtime-error';if(s==='compile error')return 'compile-error';if(s==='time limit exceeded'||s==='timeout')return 'time-limit';if(s==='memory limit exceeded')return 'memory-limit';if(s==='output limit exceeded')return 'output-limit';if(/^(pending|queued|running|judging|compiling|waiting)$/.test(s))return 'pending';if(/error|fail/.test(s))return 'system-error';return 'unknown'}
function ranked(mode='history'){return (data?.teams??[]).filter(t=>!t.archived).map(t=>({...t,computed:totalScore(t.historical,data.tbest),bestSubmission:bestHistoricalSubmission(t,data.tbest)})).sort((a,b)=>mode==='history'?b.computed-a.computed||a.officialRank-b.officialRank:mode==='single'?(b.bestSubmission?.score??0)-(a.bestSubmission?.score??0)||a.officialRank-b.officialRank:a.officialRank-b.officialRank)}
function viewTimes(t,mode=view){return mode==='history'?t.historical:mode==='single'?(t.bestSubmission?.times??data.tbest.map(()=>null)):t.latest}
function ownerLabels(){const names=new Map(data.teams.map(t=>[t.id,t.name]));return resolveTbestOwners(data).map(o=>({...o,names:o.teamIds.map(id=>names.get(id)),label:o.teamIds.length?o.teamIds.map(id=>names.get(id)).join('、'):'未采集到归属'}))}
function ownerCell(owner){return `<span title="${esc(owner.label)}">${esc(owner.label)}</span>${owner.method==='observed-match'?'<small class="owner-method">历史耗时匹配</small>':owner.method==='official-submission'?'<small class="owner-method">官方提交标识</small>':''}`}
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
  return `<tr data-row-team="${esc(t.id)}"><td><span class="rank ${t.displayRank<=3?'top':''}">${recomputed?t.displayRank:t.officialRank}</span></td><td class="team-cell"><button class="star ${favoriteIds.has(t.id)?'selected':''}" data-star="${esc(t.id)}" aria-label="${favoriteIds.has(t.id)?'取消关注':'关注'} ${esc(t.name)}">${favoriteIds.has(t.id)?'★':'☆'}</button><button data-team="${esc(t.id)}" title="查看 ${esc(t.name)} 详情">${esc(t.name)}</button><small>${esc(t.submitter)}</small></td><td><span class="status ${statusClass(t.status)}">${esc(t.status)}</span></td><td class="numeric score mono">${fmt(score)}</td>${recomputed?`<td class="numeric mono">${fmt(t.officialScore)}</td><td class="numeric delta mono">${score>=t.officialScore?'+':''}${fmt(score-t.officialScore)}</td>`:''}<td class="mono ${bestCount?'green':'muted'}">${bestCount} / ${data.tbest.length}</td>${times.map((v,i)=>`<td class="numeric mono time-cell ${validTime(v)&&validTime(best[i])&&v<=best[i]*1.000001?'best':''}">${time(v)}<small class="point-score" title="按官方当前 TBest 计算">${pointScore(v,best[i]).toFixed(1)} 分</small></td>`).join('')}<td class="mono muted time-cell">${single?submissionLabel:date(t.submittedAt)}</td></tr>`;
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
function freshness(){if(!data)return;const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.capturedAt))/1000));$('#updated').textContent=`更新于 ${date(data.capturedAt)} · ${age<60?age+' 秒':Math.floor(age/60)+' 分钟'}前`;const stale=age>180;$('#notice').classList.toggle('warning',stale);$('#notice').textContent=stale?`数据已 ${Math.floor(age/60)} 分钟未更新，请查看采集状态。当前显示最后一次成功快照。`:`历史记录始于 ${date(data.startedAt)}（北京时间）。启动前的提交未包含在历史榜中。`;}
function render(){
 const r=ranked(),owners=ownerLabels();
 $('#stat-teams').textContent=r.length;$('#stat-pass').textContent=`${r.filter(t=>/^pass$/i.test(t.status)).length} 支队伍当前通过`;
 $('#stat-best').textContent=fmt(r[0]?.computed);$('#stat-leader').textContent=r[0]?.name??'等待数据';$('#stat-points').textContent=data.tbest.length;
 $('#stat-snapshots').textContent=data.snapshotCount??Math.max(0,...r.map(t=>t.observations??0));$('#stat-start').textContent=`始于 ${date(data.startedAt)}`;$('#history-count').textContent=r.length;
 $('#reference').innerHTML=data.tbest.map((t,i)=>`<div class="reference-item"><small>测试点 ${String(i+1).padStart(2,'0')}</small><strong>${time(t)}</strong><span class="reference-owner" title="${esc(owners[i].label)}">${esc(owners[i].label)}</span></div>`).join('');
 freshness();renderTable();if(selectedTeam&&$('#team-dialog').open)renderDetail(selectedTeam);
}
async function refresh(manual=false){
 if(busy||(!manual&&paused))return;busy=true;$('#refresh').disabled=true;$('#refresh').textContent='↻ 读取中…';
 try{
  let next,error;const previousAt=data?.capturedAt;
  const urls=location.hostname==='localhost'||location.hostname==='127.0.0.1'?['./data/latest.json',remote]:[remote,'./data/latest.json'];
  for(const url of urls){try{const res=await fetch(`${url}?t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!res.ok)throw Error('HTTP '+res.status);const candidate=await res.json();if(candidate.schemaVersion!==1||!candidate.teams?.length||!candidate.tbest?.length)throw Error('无效快照');next=candidate;break}catch(e){error=e}}
  if(!next)throw error;
  const newer=!previousAt||Date.parse(next.capturedAt)>Date.parse(previousAt);
  if(!data||Date.parse(next.capturedAt)>=Date.parse(data.capturedAt)){data=next;storage.set('cache',data);render()}
  if(manual)toast(newer?`已更新到 ${date(data.capturedAt)} 的快照`:'已检查，暂无更新的快照');
 }catch(e){$('#notice').classList.add('warning');$('#notice').textContent=data?'同步失败，保留上次有效数据。请检查网络或稍后重试。':'暂时无法读取数据。首次采集可能尚未完成，请稍后刷新或查看采集状态。';if(manual)toast('同步失败，请稍后重试')}
 finally{busy=false;$('#refresh').disabled=false;$('#refresh').textContent='↻ 读取最新快照'}
}
function chart(history){
 const h=history.length?[...history]:[{at:data.capturedAt,computed:0,official:0}];
 if(h.at(-1).at!==data.capturedAt)h.push({...h.at(-1),at:data.capturedAt});
 const W=900,H=220,L=43,R=15,TOP=22,B=34,plotW=W-L-R,plotH=H-TOP-B;
 const start=Date.parse(h[0].at),end=Date.parse(data.capturedAt),span=Math.max(1,end-start);
 const x=p=>L+(Date.parse(p.at)-start)/span*plotW,y=v=>TOP+(100-Math.max(0,Math.min(100,v)))/100*plotH;
 const line=key=>h.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
 const tail=h.at(-1),blue=line('computed'),grey=line('official');
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="历史计算总分和官方分趋势"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--blue)" stop-opacity=".22"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>${[0,50,100].map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="5 5"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}<path d="${blue} L${x(tail)},${y(0)} L${x(h[0])},${y(0)} Z" fill="url(#area)"/><path d="${grey}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="6 6"/><path d="${blue}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linejoin="round"/>${h.map(p=>`<circle cx="${x(p)}" cy="${y(p.computed)}" r="${h.length===1?4:2}" fill="var(--blue)"><title>${esc(date(p.at))} 计算分 ${fmt(p.computed)} / 官方分 ${fmt(p.official)}</title></circle>`).join('')}<circle cx="${x(tail)}" cy="${y(tail.computed)}" r="4.5" fill="var(--blue)" stroke="var(--surface)" stroke-width="2"/><text x="${L}" y="${H-8}">${esc(date(h[0].at))}</text><text x="${W-R}" y="${H-8}" text-anchor="end">${esc(date(data.capturedAt))}</text></svg>`;
}
function renderDetail(id){
 const mode=view==='single'?'single':'history',r=ranked(mode),t=r.find(t=>t.id===id);if(!t)return;
 const single=mode==='single',times=viewTimes(t,mode),score=single?(t.bestSubmission?.score??0):t.computed,rank=r.findIndex(x=>x.id===id)+1,diff=score-t.officialScore,owners=ownerLabels();
 const bestCount=times.filter((v,i)=>validTime(v)&&v<=data.tbest[i]*1.000001).length;
 $('#detail-title').textContent=t.name;
 $('#detail-subtitle').innerHTML=`<span class="status ${statusClass(t.status)}">${esc(t.status)}</span> &nbsp; 最新提交者 ${esc(t.submitter)} · ${date(t.submittedAt)} · ${t.observations??1} 次采集`;
 const chosen=t.bestSubmission;
 const chosenInfo=single?`<p class="submission-info">所选历史提交：${chosen?.submittedAt?date(chosen.submittedAt):chosen?.observedAt?'采集于 '+date(chosen.observedAt):'未记录时间'} · ${chosen?.submissionId?'ID '+esc(chosen.submissionId):'旧快照未记录提交 ID'}<br>全部测试点来自这一份提交，按官方当前 TBest 重新计分。</p>`:'';
 const trend=single?'':`<h3 class="detail-section-title">趋势 <span>${t.history.length} 个变化点</span></h3><div class="chart-box"><div class="chart-legend"><span><i></i>逐点组合分</span><span><i class="dashed"></i>官方分</span></div>${chart(t.history)}</div>`;
 $('#detail-content').innerHTML=`<h3 class="detail-section-title">${single?'最佳单次历史提交':'逐点历史最优组合'}</h3><div class="detail-stats"><div class="detail-stat"><small>排名（重算 / 官）</small><strong>#${rank}<span class="muted" style="font-size:18px"> / #${t.officialRank}</span></strong></div><div class="detail-stat"><small>${single?'单次提交重算分':'逐点组合分'}</small><strong class="blue">${fmt(score)}</strong></div><div class="detail-stat"><small>官方当前分</small><strong>${fmt(t.officialScore)}</strong></div><div class="detail-stat"><small>分差</small><strong style="color:var(--orange)">${diff>=0?'+':''}${fmt(diff)}</strong></div></div>${chosenInfo}${trend}<h3 class="detail-section-title">逐点明细 <span style="color:var(--green)">TBest × ${bestCount}</span></h3><div class="detail-table"><table><thead><tr><th>点</th><th class="numeric">${single?'所选历史提交':'历史最好'}</th><th class="numeric">本队最新</th><th class="numeric">官方 TBest</th><th>TBest 队伍</th><th class="numeric">t / T</th><th class="numeric">得分</th><th class="numeric">差距</th></tr></thead><tbody>${data.tbest.map((T,i)=>{const t0=times[i],s=pointScore(t0,T),best=validTime(t0)&&t0<=T*1.000001;return `<tr><td class="point-name">点${i+1}</td><td class="numeric mono ${best?'green':''}" style="font-weight:700">${time(t0)}</td><td class="numeric mono">${time(t.latest[i])}</td><td class="numeric mono muted">${time(T)}</td><td class="baseline-team">${ownerCell(owners[i])}</td><td class="numeric mono">${validTime(t0)?(t0/T).toFixed(2)+'×':'—'}</td><td class="numeric mono"><span class="mini-bar"><i class="${best?'best':''}" style="width:${s}%"></i></span>${s.toFixed(1)}</td><td class="numeric mono ${best?'green':'muted'}">${best?(t0<T*.999999?'参考变化':'TBest'):validTime(t0)?'+'+time(t0-T):'—'}</td></tr>`}).join('')}</tbody></table></div><p class="detail-note">${single?'逐次重算监控期间采集到的历史提交，选择当前得分最高的一次；没有拼接不同提交的测试点。':'历史最好取监控期间每点最低有效耗时，可能组合多次提交。趋势保留当时的官方 TBest 与得分。'}<br>TBest 队伍优先按官方提交标识核对；“历史耗时匹配”表示采集记录中出现过与官方 TBest 相同的原始耗时，不代表官方唯一归属。未匹配到时显示“未采集到归属”。启动前或采集间隔内遗漏的提交不在本系统历史范围内。</p>`;
}
function showTeam(id){selectedTeam=id;renderDetail(id);if(!$('#team-dialog').open)$('#team-dialog').showModal();location.hash='team='+encodeURIComponent(id)}
$('#theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('cann-monitor:theme',theme)}catch{};document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d111b':'#f6f8fc'});
$('#refresh').addEventListener('click',()=>refresh(true));$('#pause').addEventListener('click',()=>{paused=!paused;$('#pause').textContent=paused?'▷ 恢复刷新':'Ⅱ 暂停刷新';$('#pause').setAttribute('aria-pressed',paused);$('#poll-status').textContent=paused?'自动刷新已暂停':'每 15 秒检查新数据';if(!paused)refresh()});
$('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderTable()});$('#favorites').addEventListener('click',()=>{onlyFavorites=!onlyFavorites;$('#favorites').setAttribute('aria-pressed',onlyFavorites);renderTable()});
$('#pin-teams').addEventListener('click',()=>{if(!data){toast('请等待榜单加载');return}$('#pin-search').value='';renderPinPicker();$('#pin-dialog').showModal()});
$('#pin-search').addEventListener('input',renderPinPicker);
$('#pin-list').addEventListener('change',e=>{const input=e.target.closest('[data-pin-id]');if(!input)return;input.checked?pinnedIds.add(input.dataset.pinId):pinnedIds.delete(input.dataset.pinId);storage.set('pinned-teams',[...pinnedIds]);renderTable();renderPinPicker()});
$('#clear-pins').addEventListener('click',()=>{pinnedIds.clear();storage.set('pinned-teams',[]);renderTable();renderPinPicker()});
$('#close-pins').addEventListener('click',()=>$('#pin-dialog').close());
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;sortKey='score';ascending=false;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',b===button)});renderTable()}));
$('#ranking').addEventListener('click',e=>{const star=e.target.closest('[data-star]'),team=e.target.closest('[data-team]'),sort=e.target.closest('[data-sort]');if(star){const id=star.dataset.star;favoriteIds.has(id)?favoriteIds.delete(id):favoriteIds.add(id);storage.set('favorites',[...favoriteIds]);renderTable()}else if(team)showTeam(team.dataset.team);else if(sort){if(sortKey===sort.dataset.sort)ascending=!ascending;else{sortKey=sort.dataset.sort;ascending=sortKey==='name'||sortKey.startsWith('point')}renderTable()}});
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
await refresh();const match=location.hash.match(/^#team=(.+)$/);if(match&&data)showTeam(decodeURIComponent(match[1]));setInterval(()=>{freshness();if(!document.hidden)refresh()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
