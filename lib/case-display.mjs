// Case selection changes presentation only. Scores, ranks and comparisons keep all cases.
export function caseNumber(label){const match=String(label??'').trim().match(/^(?:测试点|点|case)\s*0*(\d+)(?=$|\s|·)/i);return match&&Number(match[1])>0?Number(match[1])-1:null}
export function visibleCaseIndices(ids,selected=null){return ids.flatMap((id,i)=>selected===null||selected.has(id)?[i]:[])}
export function caseColumns(cells){let offset=0;return cells.flatMap(cell=>{const start=offset;offset+=cell.span??1;const index=caseNumber(cell.label);return index===null?[]:[{column:start,index}]})}
let catalog=[],scheduled=false;
const scopes='.reference-panel,.ranking-panel,.record-panel,.reference-chart-card,.activity-card,dialog',states=new WeakMap();
export function setCaseCatalog(ids){const next=(ids??[]).map(String);if(JSON.stringify(next)!==JSON.stringify(catalog)){catalog=next;schedule()}}
export function selectedCaseIndices(target,count=catalog.length){const state=target&&states.get(target);return visibleCaseIndices(catalog.length?catalog:Array.from({length:count},(_,i)=>String(i)),state?.selected??null)}
const own=(node,target)=>node.closest(scopes)===target;
function identify(target){
 const found=[];const add=(node,index)=>{if(index!==null&&index>=0&&own(node,target)){found.push({node,index});return true}return false};
 for(const node of target.querySelectorAll('[data-case-index]'))add(node,Number(node.dataset.caseIndex));
 for(const table of target.querySelectorAll('table')){
  if(!own(table,target))continue;
  const columns=caseColumns([...table.tHead?.rows[0]?.cells??[]].map(cell=>({label:cell.textContent,span:cell.colSpan})));
  for(const row of table.rows){
   let offset=0;for(const cell of row.cells){const start=offset;offset+=cell.colSpan;const column=columns.find(c=>c.column===start&&cell.colSpan===1);if(column)add(cell,column.index)}
   if(!columns.length&&row.parentElement.tagName!=='THEAD'){
    const label=[...row.cells].slice(0,2).find(cell=>caseNumber(cell.textContent)!==null);if(label)add(row,caseNumber(label.textContent));
   }
  }
 }
 for(const node of target.querySelectorAll('.reference-item,.priority-row,#chart-readout>div,#tbest-attribution>article'))add(node,caseNumber(node.querySelector('small,b')?.textContent));
 return found;
}
function title(target){return target.querySelector('h2')?.textContent.trim()||target.getAttribute('aria-label')||(target.matches('.ranking-panel')?'成绩排行榜':'当前面板')}
function apply(target,state,items){
 const selected=new Set(selectedCaseIndices(target));let priority=0;
 for(const {node,index}of items){let visible=selected.has(index);if(visible&&node.matches('.priority-row')&&!target.classList.contains('priority-expanded')&&state.selected===null)visible=priority++<4;
  if(visible){if(node.hasAttribute('data-case-hidden'))node.removeAttribute('data-case-hidden')}else if(!node.hasAttribute('data-case-hidden'))node.setAttribute('data-case-hidden','');
 }
 const count=selected.size,summary=state.control.querySelector('summary'),label=count===catalog.length?`选择 case · 全部 ${count} 项`:`选择 case · ${count} / ${catalog.length}`;
 if(summary.textContent!==label)summary.textContent=label;
 const note=state.control.querySelector('.case-display-note'),text=count?`展示：${[...selected].map(i=>'case'+(i+1)).join('、')}。仅控制展示，总分与排名仍按全部测试点计算。`:'未选择 case，请选择要展示的测试点。';
 if(note.textContent!==text)note.textContent=text;
 for(const input of state.control.querySelectorAll('input')){input.checked=selected.has(Number(input.value));}
 const brief=target.querySelector(':scope > .case-display-context'),context=state.selected===null?'':`仅展示 ${[...selected].map(i=>'case'+(i+1)).join('、')||'无 case'} · 总分、排名与统计仍按全部测试点计算`;
 if(brief&&brief.textContent!==context)brief.textContent=context;
 if(brief)brief.hidden=!context;
}
function install(){
 if(!catalog.length)return;
 for(const target of document.querySelectorAll(scopes)){
  if(target.closest('[data-image-export]'))continue;
  const items=identify(target);if(!items.length&&!target.hasAttribute('data-case-scope'))continue;
  let state=states.get(target);
  if(!state){state={selected:null,control:document.createElement('details'),signature:''};states.set(target,state);state.control.className='case-display-picker';state.control.dataset.shareExclude='';
   state.control.innerHTML='<summary></summary><div class="case-display-menu"><div class="case-display-actions"><button type="button" class="button" data-case-all>全选</button><button type="button" class="button" data-case-none>清空</button><button type="button" class="button" data-case-invert>反选</button></div><div class="case-display-options"></div><p class="case-display-note"></p></div>';
   const change=()=>{apply(target,state,identify(target));target.dispatchEvent(new CustomEvent('case-display-change',{bubbles:true}));};
   state.control.addEventListener('change',event=>{if(!event.target.matches('input'))return;const indices=new Set(selectedCaseIndices(target));const i=Number(event.target.value);event.target.checked?indices.add(i):indices.delete(i);state.selected=indices.size===catalog.length?null:new Set([...indices].map(i=>catalog[i]));change()});
   state.control.addEventListener('click',event=>{const all=event.target.closest('[data-case-all]'),none=event.target.closest('[data-case-none]'),invert=event.target.closest('[data-case-invert]');if(!all&&!none&&!invert)return;state.selected=all?null:none?new Set():new Set(catalog.filter((_,i)=>!selectedCaseIndices(target).includes(i)));change()});
  }
  state.control.querySelector('summary').setAttribute('aria-label',title(target)+' · 选择 case');
  const signature=JSON.stringify(catalog);if(state.signature!==signature){state.signature=signature;const options=state.control.querySelector('.case-display-options');options.replaceChildren(...catalog.map((_,i)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=String(i);label.append(input,'case'+(i+1));return label}))}
  if(!target.contains(state.control)){const anchor=target.querySelector(':scope > .share-tools');anchor?anchor.after(state.control):target.prepend(state.control)}
  if(!target.querySelector(':scope > .case-display-context')){const context=document.createElement('p');context.className='case-display-context';state.control.after(context)}
  apply(target,state,items);
 }
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;install()})}
export const refreshCaseDisplays=install;
if(typeof document!=='undefined'){
 new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.case-display-picker,.case-display-context,[data-image-export]')))schedule()}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('click',event=>{if(!event.target.closest('.case-display-picker'))document.querySelectorAll('.case-display-picker[open]').forEach(n=>n.open=false)});
}
