import {pointScore,totalScore,validTime} from './scoring.mjs';
import {teamTimes,modeLabel,estimateScenario,submissionsFor} from './analytics.mjs';

// Analysis uses a captured snapshot so a background refresh cannot alter edited inputs.
export function initAnalysis({getData,getView,getPinned,esc,fmt,time,date,toast}){
 const $=s=>document.querySelector(s);
 let snapshot=null,kind='',teamId='',mode='history';
 const compareIds=new Set();
 const modes=()=>['history','single','official'].map(m=>`<option value="${m}" ${mode===m?'selected':''}>${modeLabel(m)}</option>`).join('');
 const teams=()=>snapshot.teams.filter(t=>!t.archived).sort((a,b)=>a.officialRank-b.officialRank);
 const teamOptions=()=>teams().map(t=>`<option value="${esc(t.id)}" ${t.id===teamId?'selected':''}>${esc(t.name)}</option>`).join('');
 const signed=n=>(n>0?'+':'')+fmt(n);
 const scoreCell=(v,T)=>`<strong class="mono">${time(v)}</strong><small>${fmt(pointScore(v,T))} 分</small>`;
 const selectMode=()=>`<label>计算口径<select id="analysis-mode">${modes()}</select></label>`;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="analysis-dialog" aria-labelledby="analysis-title"><div class="modal-header"><div><h2 id="analysis-title"></h2><p id="analysis-snapshot" class="muted"></p></div><button id="close-analysis" class="icon-button" aria-label="关闭分析">×</button></div><div id="analysis-content"></div></dialog>`);
 document.querySelector('.reference-panel').insertAdjacentHTML('afterend','<section id="changes-panel" class="changes-panel" aria-label="最近榜单变化" hidden></section>');
 const actions=document.createElement('div');actions.className='analysis-actions';
 actions.innerHTML='<span>成绩分析</span><button class="button" data-analysis="compare">⇄ 队伍对比</button><button class="button" data-analysis="scenario">ϟ 优化模拟</button><button class="button" data-analysis="submissions">◷ 历史提交对比</button>';
 document.querySelector('.ranking-toolbar').before(actions);

 function open(type,id){
  const current=getData();if(!current){toast('请等待榜单加载');return}
  snapshot=structuredClone(current);kind=type;mode=getView();teamId=id||getPinned().find(id=>snapshot.teams.some(t=>t.id===id&&!t.archived))||teams()[0]?.id;
  $('#analysis-title').textContent=type==='compare'?'队伍逐点对比':type==='scenario'?'优化模拟':'历史提交对比';
  $('#analysis-snapshot').textContent=`使用 ${date(snapshot.capturedAt)} 快照 · 官方当前 TBest · 分析期间固定此快照`;
  if(type==='compare'){
   const eligible=new Set(teams().map(t=>t.id));for(const id of compareIds)if(!eligible.has(id))compareIds.delete(id);
   if(!compareIds.size)getPinned().filter(id=>eligible.has(id)).slice(0,4).forEach(id=>compareIds.add(id));
   $('#analysis-content').innerHTML=`<p class="detail-note">选择 2–4 支队伍，比较同一组官方 TBest 下的逐点耗时与得分。绿色表示所选队伍中该点最快。</p><div class="analysis-filters">${selectMode()}<label class="search"><input type="search" id="compare-search" aria-label="搜索对比队伍" placeholder="搜索对比队伍"></label><button id="clear-compare" class="button">清空选择</button><span id="compare-count" class="muted"></span></div><div id="compare-picker" class="compare-picker"></div><div id="analysis-result"></div>`;
   renderPicker();renderCompare();
  }else{
   $('#analysis-content').innerHTML=`<div class="analysis-filters"><label>队伍<select id="analysis-team">${teamOptions()}</select></label>${type==='scenario'?selectMode():''}</div><div id="analysis-body"></div>`;
   type==='scenario'?renderScenario():renderSubmissions();
  }
  if(!$('#analysis-dialog').open)$('#analysis-dialog').showModal();
 }
 function renderPicker(){
  const q=$('#compare-search').value.trim().toLowerCase();
  $('#compare-count').textContent=`已选 ${compareIds.size} / 4 支`;
  $('#compare-picker').innerHTML=teams().filter(t=>!q||`${t.name} ${t.submitter}`.toLowerCase().includes(q)).map(t=>`<label class="compare-option"><input type="checkbox" data-compare="${esc(t.id)}" ${compareIds.has(t.id)?'checked':''} ${compareIds.size>=4&&!compareIds.has(t.id)?'disabled':''}><span>${esc(t.name)}</span></label>`).join('')||'<span class="muted">未找到队伍</span>';
 }
 function renderCompare(){
  const chosen=teams().filter(t=>compareIds.has(t.id));
  if(chosen.length<2){$('#analysis-result').innerHTML='<div class="analysis-empty">请选择至少 2 支队伍开始比较。</div>';return}
  const vectors=chosen.map(t=>teamTimes(t,mode,snapshot.tbest));
  $('#analysis-result').innerHTML=`<div class="analysis-context">${modeLabel(mode)} · 全部得分以同一组官方 TBest 重算</div><div class="detail-table comparison-table"><table><thead><tr><th>测试点</th><th class="numeric">官方 TBest</th>${chosen.map(t=>`<th class="numeric">${esc(t.name)}</th>`).join('')}</tr></thead><tbody><tr class="comparison-total"><th>重算总分</th><td></td>${vectors.map(v=>`<td class="numeric mono blue">${fmt(totalScore(v,snapshot.tbest))}</td>`).join('')}</tr>${snapshot.tbest.map((T,i)=>{const fastest=Math.min(...vectors.map(v=>validTime(v[i])?v[i]:Infinity));return `<tr><th>点 ${i+1}</th><td class="numeric mono muted">${time(T)}</td>${vectors.map(v=>`<td class="numeric analysis-value ${v[i]===fastest?'green':''}">${scoreCell(v[i],T)}</td>`).join('')}</tr>`}).join('')}</tbody></table></div><p class="detail-note">“官方最新提交”也按当前 TBest 重算，显示完整精度。未通过或缺失的点计 0 分；不会用历史耗时填补。</p>`;
 }
 function renderScenario(){
  const team=teams().find(t=>t.id===teamId),times=teamTimes(team,mode,snapshot.tbest);
  $('#analysis-body').innerHTML=`<p class="detail-note">输入预计耗时（μs），模拟该队在此口径下的总分和名次。其他队伍与官方 TBest 保持此快照的数值。留空表示缺失，该点计 0 分。</p><div id="scenario-summary" class="scenario-summary" role="status" aria-live="polite"></div><div class="detail-table"><table class="scenario-table"><thead><tr><th>测试点</th><th class="numeric">原始耗时</th><th class="numeric">官方 TBest</th><th>模拟耗时（μs）</th><th class="numeric">模拟得分</th><th class="numeric">得分变化</th></tr></thead><tbody>${snapshot.tbest.map((T,i)=>`<tr><th>点 ${i+1}</th><td class="numeric mono">${time(times[i])}</td><td class="numeric mono muted">${time(T)}</td><td><input class="scenario-time" type="number" inputmode="decimal" min="0" step="any" aria-label="点${i+1}模拟耗时（微秒）" data-scenario-point="${i}" value="${validTime(times[i])?times[i]:''}"></td><td class="numeric mono" data-scenario-score="${i}"></td><td class="numeric mono" data-scenario-delta="${i}"></td></tr>`).join('')}</tbody></table></div><div class="analysis-bottom-actions"><button class="button" id="reset-scenario">恢复原始耗时</button><button class="button" id="tbest-scenario">全部设为官方 TBest</button></div><p class="detail-note">预计名次按所有队伍的重算分排序；同分按官方名次排列。低于 TBest 的单点最多 100 分。模拟值只在当前窗口有效，不会修改实际排名或采集数据。</p>`;
  updateScenario();
 }
 function updateScenario(){
  const inputs=[...document.querySelectorAll('[data-scenario-point]')];
  const times=inputs.map(input=>input.value.trim()===''?null:Number(input.value));
  const invalid=inputs.map((input,i)=>{const bad=input.validity.badInput||(times[i]!==null&&!validTime(times[i]));input.setAttribute('aria-invalid',bad);return bad}).some(Boolean);
  if(invalid){$('#scenario-summary').innerHTML='<p class="form-error">耗时必须为大于 0 的有限数值，或留空。</p>';document.querySelectorAll('[data-scenario-score],[data-scenario-delta]').forEach(cell=>cell.textContent='—');return}
  const result=estimateScenario(snapshot,teamId,mode,times),original=teamTimes(teams().find(t=>t.id===teamId),mode,snapshot.tbest);
  $('#scenario-summary').innerHTML=`<div><small>原始重算总分</small><strong class="mono">${fmt(result.before)}</strong></div><div><small>模拟总分</small><strong class="mono blue">${fmt(result.after)}</strong></div><div><small>分数变化</small><strong class="mono ${result.delta>=0?'green':'loss'}">${signed(result.delta)}</strong></div><div><small>预计名次 / 原名次</small><strong class="mono">#${result.rank} <span class="muted">/ #${result.beforeRank}</span></strong></div>`;
  times.forEach((v,i)=>{const score=pointScore(v,snapshot.tbest[i]),delta=score-pointScore(original[i],snapshot.tbest[i]);$(`[data-scenario-score="${i}"]`).textContent=fmt(score);const cell=$(`[data-scenario-delta="${i}"]`);cell.textContent=signed(delta);cell.classList.toggle('green',delta>0);cell.classList.toggle('loss',delta<0)});
 }
 function renderSubmissions(){
  const team=teams().find(t=>t.id===teamId),records=submissionsFor(team,snapshot.tbest);
  if(!records.length){$('#analysis-body').innerHTML='<p class="analysis-empty">还没有采集到此队伍的提交向量。</p>';return}
  const title=s=>`${s.submittedAt?date(s.submittedAt):s.observedAt?'采集于 '+date(s.observedAt):'时间未记录'} · ${fmt(s.score)} 分 · ${s.submissionId?'ID …'+s.submissionId.slice(-8):'无提交 ID'}`;
  const options=records.map(s=>`<option value="${s.key}">${esc(title(s))}</option>`).join('');
  $('#analysis-body').innerHTML=`<p class="detail-note">对比两份完整提交，统一按此快照的官方当前 TBest 重算。未将不同提交的测试点组合；正向分差表示 B 比 A 得分更高。</p><div class="submission-selectors"><label>提交 A<select id="submission-a">${options}</select></label><label>提交 B<select id="submission-b">${options}</select></label></div><div id="submission-result"></div><p class="detail-note">共采集到 ${records.length} 份提交向量。只包含监控以来观察到的提交，启动前及采集间隔遗漏的提交不在其中；旧记录没有提交 ID 时按耗时向量去重。</p>`;
  $('#submission-a').value=records[0].key;$('#submission-b').value=records.at(-1).key;
  updateSubmissions();
 }
 function updateSubmissions(){
  const records=submissionsFor(teams().find(t=>t.id===teamId),snapshot.tbest),a=records.find(s=>s.key===$('#submission-a').value),b=records.find(s=>s.key===$('#submission-b').value);
  if(!a||!b)return;
  $('#submission-result').innerHTML=`<div class="scenario-summary"><div><small>A 重算总分</small><strong class="mono">${fmt(a.score)}</strong></div><div><small>B 重算总分</small><strong class="mono blue">${fmt(b.score)}</strong></div><div><small>B − A 总分变化</small><strong class="mono ${b.score>=a.score?'green':'loss'}">${signed(b.score-a.score)}</strong></div></div><div class="submission-identities"><span>A：${esc(a.submissionId||'旧记录无提交 ID')}</span><span>B：${esc(b.submissionId||'旧记录无提交 ID')}</span></div><div class="detail-table comparison-table"><table><thead><tr><th>测试点</th><th class="numeric">官方 TBest</th><th class="numeric">提交 A</th><th class="numeric">提交 B</th><th class="numeric">耗时变化 B − A</th><th class="numeric">得分变化 B − A</th></tr></thead><tbody>${snapshot.tbest.map((T,i)=>{const x=a.times[i],y=b.times[i],delta=pointScore(y,T)-pointScore(x,T),valid=validTime(x)&&validTime(y);return `<tr><th>点 ${i+1}</th><td class="numeric mono muted">${time(T)}</td><td class="numeric analysis-value">${scoreCell(x,T)}</td><td class="numeric analysis-value">${scoreCell(y,T)}</td><td class="numeric mono ${valid?(y<x?'green':y>x?'loss':''):''}">${valid?signed(y-x)+' μs':'—'}${valid?`<small>${signed((y/x-1)*100)}%</small>`:''}</td><td class="numeric mono ${delta>0?'green':delta<0?'loss':''}">${signed(delta)}</td></tr>`}).join('')}</tbody></table></div>`;
 }
 $('#close-analysis').addEventListener('click',()=>$('#analysis-dialog').close());
 document.addEventListener('click',e=>{const trigger=e.target.closest('[data-analysis]');if(trigger)open(trigger.dataset.analysis,trigger.dataset.analysisTeam)});
 $('#analysis-content').addEventListener('change',e=>{
  if(e.target.matches('[data-compare]')){e.target.checked?compareIds.add(e.target.dataset.compare):compareIds.delete(e.target.dataset.compare);if(compareIds.size>4)compareIds.delete(e.target.dataset.compare);renderPicker();renderCompare()}
  if(e.target.id==='analysis-team'){teamId=e.target.value;kind==='scenario'?renderScenario():renderSubmissions()}
  if(e.target.id==='analysis-mode'){mode=e.target.value;kind==='compare'?renderCompare():renderScenario()}
  if(e.target.id==='submission-a'||e.target.id==='submission-b')updateSubmissions();
 });
 $('#analysis-content').addEventListener('input',e=>{if(e.target.id==='compare-search')renderPicker();if(e.target.matches('[data-scenario-point]'))updateScenario()});
 $('#analysis-content').addEventListener('click',e=>{
  if(e.target.closest('#clear-compare')){compareIds.clear();renderPicker();renderCompare()}
  if(e.target.closest('#reset-scenario'))renderScenario();
  if(e.target.closest('#tbest-scenario')){document.querySelectorAll('[data-scenario-point]').forEach(input=>input.value=snapshot.tbest[Number(input.dataset.scenarioPoint)]);updateScenario()}
 });
 function renderChanges(){
  const current=getData(),change=current?.changes,panel=$('#changes-panel');
  if(!change){panel.hidden=true;return}
  const movements=Object.entries(change.ranks??{}).filter(([id,m])=>m[getView()]!==0&&current.teams.some(t=>t.id===id&&!t.archived));
  if(!change.tbest?.length&&!movements.length){panel.hidden=true;return}
  panel.hidden=false;
  panel.innerHTML=`<div class="section-title"><h2>最近一次榜单变动</h2><span class="muted">${date(change.at)} · 对比 ${date(change.since)} · ${modeLabel(getView())}</span></div><div class="change-chips">${(change.tbest??[]).map(c=>`<span class="change-chip">点 ${c.index+1} TBest：<b>${time(c.before)} → ${time(c.after)}</b></span>`).join('')}${movements.slice(0,8).map(([id,m])=>{const t=current.teams.find(t=>t.id===id),delta=m[getView()];return `<span class="change-chip ${delta===null||delta>0?'green':'loss'}">${esc(t.name)} ${delta===null?'新入榜':delta>0?'↑ '+delta:'↓ '+Math.abs(delta)}</span>`}).join('')}${movements.length>8?`<span class="muted">另 ${movements.length-8} 支队伍有变化，详见排名旁标记</span>`:''}</div>`;
 }
 return {open,renderChanges};
}
