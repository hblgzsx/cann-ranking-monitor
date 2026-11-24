import {analyzeTeamSubmission} from './team-report.mjs';
import {filterSubmissions,statusGroup} from './submissions.mjs?v=20261124-cases';
import {validTime} from './scoring.mjs?v=20261124-cases';
import {icon} from './icons.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—',signed=n=>(n>0?'+':'')+fmt(n);
const date=t=>t&&Number.isFinite(Date.parse(t))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t)):'未记录';
const time=t=>validTime(t)?t>=1000?(t/1000).toFixed(2)+' ms':t.toFixed(2)+' μs':'—';
const statusClass=s=>({'Pass':'pass','Wrong Answer':'wrong-answer','Runtime Error':'runtime-error','Compile Error':'compile-error','Time Limit Exceeded':'time-limit','Memory Limit Exceeded':'memory-limit','Output Limit Exceeded':'output-limit'}[s]??(statusGroup(s)==='pending'?'pending':'unknown'));
export function initSubmissionAnalysis({getData,getReport}){
 const params=new URLSearchParams(location.search);let selection=params.get('submission')??'best',reference=params.get('reference')??'best',showAll=false,analysis=null;
 const label=r=>`${r.submissionId||'无 ID 旧快照'} · ${date(r.eventAt)} · ${fmt(r.score)} 分`;
 function syncUrl(){const report=getReport();if(!report)return;const query=new URLSearchParams({team:report.team.id});if(selection!=='best')query.set('submission',analysis?.selected?.submissionId||selection);if(reference!=='best')query.set('reference',analysis?.baseline?.submissionId||reference);history.replaceState(null,'',location.pathname+'?'+query.toString())}
 function render(){
  const report=getReport(),data=getData();if(!report||!data)return;
  analysis=analyzeTeamSubmission(report,data.tbest,selection,reference);
  const markup='<option value="best">最佳单次历史提交（随 TBest 更新）</option><option value="latest">最新已采集提交</option>'+filterSubmissions(report.records).map(r=>`<option value="${esc(r.key)}">${esc(label(r))}</option>`).join('');
  for(const [id,value] of [['priority-submission',selection],['reference-submission',reference]]){const select=$('#'+id);if(select.innerHTML!==markup)select.innerHTML=markup;select.value=value==='best'||value==='latest'?value:report.records.find(r=>r.key===value||r.submissionId===value)?.key??''}
  const r=analysis.selected,b=analysis.baseline;
  $('#priority-best').setAttribute('aria-pressed',selection==='best');$('#priority-latest').setAttribute('aria-pressed',selection==='latest');
  $('#priority-all').textContent=showAll?'只看失分前 4 点':`查看全部 ${data.tbest.length} 点`;$('#priority-all').setAttribute('aria-expanded',showAll);
  $('#priority-context').innerHTML=r?`<strong class="blue mono">${fmt(analysis.score)} 分</strong><span class="status ${statusClass(r.status)}">${esc(r.status??'状态未记录')}</span><span class="submission-id-full">${esc(r.submissionId||'无 ID · 旧快照')}<br>${r.timeBasis==='submitted'?'提交':'首次采集'} ${date(r.eventAt)}</span>`:'<span class="loss">未找到所选提交。它可能尚未被本系统采集，请选择已有记录。</span>';
  $('#report-priorities').innerHTML=r?analysis.weakest.slice(0,showAll?undefined:4).map(p=>`<div class="priority-row"><div><b>点 ${p.index+1}${!validTime(p.time)?' · 缺失 / 未通过':''}</b><span class="muted">${time(p.time)} / TBest ${time(p.T)}</span></div><div class="priority-bar"><i style="width:${p.score}%"></i></div><div><span class="mono blue">${fmt(p.score)} 分</span><span class="loss">总分损失 ${fmt(p.loss)}</span></div></div>`).join(''):'<div class="analysis-empty">暂无该提交的逐点数据。</div>';
  renderComparison(analysis);$('#analysis-share-url').hidden=true;syncUrl();
 }
 function select(key,scroll=false){selection=key;render();if(scroll)$('#priority-analysis').scrollIntoView({behavior:'smooth',block:'start'})}
 $('#priority-submission').addEventListener('change',e=>select(e.target.value));
 $('#reference-submission').addEventListener('change',e=>{reference=e.target.value;render()});
 $('#priority-best').addEventListener('click',()=>select('best'));$('#priority-latest').addEventListener('click',()=>select('latest'));
 $('#priority-all').addEventListener('click',()=>{showAll=!showAll;render()});
 $('#copy-analysis-link').innerHTML=icon('link')+' 复制此提交分析链接';
 $('#copy-analysis-link').addEventListener('click',async()=>{
  if(!analysis?.selected)return;
  const url=new URL(location.href);url.searchParams.set('submission',analysis.selected.submissionId||analysis.selected.key);if(analysis.baseline)url.searchParams.set('reference',analysis.baseline.submissionId||analysis.baseline.key);
  try{await navigator.clipboard.writeText(url.href);$('#share-feedback').textContent='已复制固定提交的分析链接'}catch{$('#analysis-share-url').hidden=false;$('#analysis-share-url').value=url.href;$('#analysis-share-url').select();$('#share-feedback').textContent='请复制下方链接'}
 });
 document.addEventListener('click',e=>{const target=e.target.closest('[data-analyze]');if(target){$('#trend-dialog').close();select(target.dataset.analyze,true)}});
 return {render,reset(){selection='best';reference='best'},syncUrl};
}
function renderComparison(analysis){
 const r=analysis.selected,b=analysis.baseline;
 $('#submission-comparison-summary').innerHTML=r&&b?`<span>所选提交 <b class="blue">${fmt(analysis.score)}</b> · 对比提交 <b>${fmt(analysis.baselineScore)}</b></span><span>总分变化 <b class="${analysis.delta>=0?'green':'loss'}">${signed(analysis.delta)}</b> · 提升 ${analysis.improved} 点 · 退化 ${analysis.regressed} 点</span>`:'<span class="muted">选择两份已采集提交后查看逐点变化。</span>';
 $('#reference-context').textContent=b?'对比 ID：'+(b.submissionId||'无 ID 旧快照')+' · '+date(b.eventAt):'未找到对比提交。';
 $('#submission-comparison-body').innerHTML=r&&b?analysis.points.map(p=>`<tr><th>点 ${p.index+1}</th><td class="numeric mono">${time(p.time)}<small>${fmt(p.score)} 分</small></td><td class="numeric mono">${time(p.baselineTime)}<small>${fmt(p.baselineScore)} 分</small></td><td class="numeric mono ${p.contribution>1e-9?'green':p.contribution< -1e-9?'loss':''}">${signed(p.contribution)}</td><td>${p.contribution>1e-9?'提升':p.contribution< -1e-9?'退化':'持平'}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">尚无可比较数据</td></tr>';
}
