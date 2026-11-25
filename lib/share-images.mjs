import {refreshCaseDisplays} from './case-display.mjs?v=20261125-case-display';
const $=s=>document.querySelector(s);
const targets='.activity-card,.record-panel,.reference-chart-card,.reference-panel,.ranking-panel,.stats,.day-metrics,dialog:not(#image-share-preview)';
const excluded='[data-share-exclude],.share-tools,.priority-shortcuts,#priority-all,.analysis-share,.analysis-actions,.analysis-bottom-actions,.compare-picker,#compare-search,#clear-compare,.star,.modal-header>.icon-button,.record-pagination,.quick-ranges,#previous-point,#next-point,.table-actions';
const glyph=kind=>`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${kind==='copy'?'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>':'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'}</svg>`;
let rendering=false,feedbackTimer;
function feedback(message){let node=$('#image-share-feedback');if(!node){node=document.createElement('div');node.id='image-share-feedback';node.setAttribute('role','status');document.body.append(node)}node.textContent=message;node.classList.add('show');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>node.classList.remove('show'),4500)}
function titleFor(node){return node.querySelector('h2')?.textContent.trim()||node.getAttribute('aria-label')||(node.matches('.ranking-panel')?'成绩排行榜':'赛事分析')}
function install(){
 for(const target of document.querySelectorAll(targets)){
  if(target.closest('[data-image-export]'))continue;
  const existing=target.querySelector(':scope > .share-tools');if(existing){for(const button of existing.querySelectorAll('button'))button.setAttribute('aria-label',titleFor(target)+' · '+(button.dataset.shareAction==='copy'?'复制图片':'下载图片'));continue}
  const tools=document.createElement('div');tools.className='share-tools';tools.dataset.shareExclude='';tools.setAttribute('aria-label',titleFor(target)+'图片分享');
  for(const [kind,label]of [['copy','复制图片'],['download','下载图片']]){const button=document.createElement('button');button.type='button';button.className='share-button';button.dataset.shareAction=kind;button.innerHTML=glyph(kind)+label;button.setAttribute('aria-label',titleFor(target)+' · '+label);tools.append(button)}
  // Keep metrics grids unchanged: their share controls are a separate sibling.
  if(target.matches('.stats,.day-metrics')){
   if(target.previousElementSibling?.classList.contains('share-tools')){target.previousElementSibling._shareTarget=target;continue}
   tools.classList.add('share-metrics-tools');tools._shareTarget=target;target.before(tools);
  }else if(target.matches('dialog'))target.querySelector('.modal-header')?.after(tools);
  else target.prepend(tools);
 }
}
function exportTree(source){
 refreshCaseDisplays();
 const theme=getComputedStyle(document.documentElement),root=document.createElement('div');root.dataset.imageExport='';root.className='image-export';root.style.cssText=`width:${Math.max(760,Math.min(1800,Math.max(source.getBoundingClientRect().width,source.scrollWidth)))}px;background:${theme.getPropertyValue('--surface')};color:${theme.getPropertyValue('--text')}`;
 const brand=document.createElement('div');brand.className='image-export-brand';brand.textContent='CANN MONITOR  /  '+(document.querySelector('#team-title')?.textContent||document.querySelector('h1')?.textContent||'BatchedDiagGmmEm');root.append(brand);
 const copy=document.createElement('div');copy.className=source.className;copy.innerHTML=source.innerHTML;root.append(copy);
 // Snapshot values before any asynchronous image work. Updating live data never changes this copy.
 const originals=source.querySelectorAll('select,input,textarea'),clones=copy.querySelectorAll('select,input,textarea');
 originals.forEach((control,i)=>{const clone=clones[i];if(!clone)return;const text=document.createElement('span');text.className='image-control-value';if(clone.id)text.id=clone.id;text.textContent=control.tagName==='SELECT'?control.selectedOptions[0]?.textContent??'':control.type==='checkbox'?(control.checked?'✓':'—'):control.value||'—';clone.replaceWith(text)});
 copy.querySelectorAll(excluded).forEach(n=>n.remove());copy.querySelectorAll('.analysis-filters>.search').forEach(n=>n.remove());
 copy.querySelectorAll('[hidden],[data-case-hidden]').forEach(n=>n.remove());
 copy.querySelectorAll('dialog').forEach(n=>{n.style.position='static';n.style.display='block'});
 copy.querySelectorAll('.table-scroll,.detail-table,.team-counts,.compare-picker').forEach(n=>{n.style.maxHeight='none';n.style.height='auto';n.style.overflow='visible'});
 copy.style.cssText='margin:0;max-height:none;height:auto;overflow:visible;position:static;width:100%;box-sizing:border-box;';
 // Only selected cases remain in the exported card; visible table columns must fit.
 const widest=Math.max(0,...[...source.querySelectorAll('table')].map(n=>n.scrollWidth));if(widest)root.style.width=Math.max(parseFloat(root.style.width),widest+56)+'px';
 const footer=document.createElement('div');footer.className='image-export-footer';
 const context=source.closest('dialog')?.querySelector('#analysis-snapshot,#record-detail-subtitle')?.textContent||$('#updated')?.textContent||$('#screen-notice')?.textContent||'';
 const selectedTab=$('[role="tab"][aria-selected="true"]')?.textContent?.trim();
 const filters=source.matches('.ranking-panel')?[$('#search')?.value?'搜索：'+$('#search').value:'',$('#region-filter')?.selectedOptions[0]?.textContent].filter(Boolean).join(' / '):'';
 footer.textContent=[context,source.matches('.ranking-panel')?selectedTab:'',filters,source.matches('.stats,.day-metrics,.activity-card')?$('#stats-day')?.value:'','CANN Monitor · 已采集数据 / 非官方分析 · 时间均为北京时间'].filter(Boolean).join(' · ');root.append(footer);
 // Keep CSS selector identities in this isolated, temporary tree. Live elements precede it in the document.
 root.setAttribute('aria-hidden','true');
 return root;
}
async function capture(tree){
 const host=document.createElement('div');host.dataset.shareExclude='';host.style.cssText='position:fixed;left:-20000px;top:0;pointer-events:none;z-index:-1;';host.append(tree);document.body.append(host);
 try{
  const {toBlob}=await import('./vendor/html-to-image.mjs');await document.fonts?.ready;
  const width=Math.ceil(tree.scrollWidth),height=Math.ceil(tree.scrollHeight),pixelRatio=Math.min(2,Math.sqrt(16000000/(width*height)));
  if(width*height>24000000)throw Error('内容过长，请先缩小筛选范围');
  const blob=await toBlob(tree,{pixelRatio,width,height,skipFonts:true,backgroundColor:getComputedStyle(tree).backgroundColor});if(!blob)throw Error('无法生成图片');return blob;
 }finally{host.remove()}
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-share-action]');if(!button||rendering)return;
 const tools=button.closest('.share-tools'),source=tools._shareTarget??tools.parentElement;if(!source||source.matches('dialog')&&!source.open)return;
 const name='CANN-'+titleFor(source).replace(/[\\/:*?"<>|]/g,'-')+'-'+new Date().toISOString().slice(0,10)+'.png';
 rendering=true;const buttons=[...tools.querySelectorAll('button')];buttons.forEach(n=>n.disabled=true);feedback('正在生成清晰图片…');
 let task;
 try{
  task=capture(exportTree(source));
  if(button.dataset.shareAction==='copy'&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
   // Pass the promise immediately so Safari can retain the original click's clipboard permission.
   try{await navigator.clipboard.write([new ClipboardItem({'image/png':task})]);feedback('图片已复制，可以直接粘贴分享')}catch(error){const blob=await task;download(blob,name);feedback('浏览器未允许复制图片，已改为下载 PNG')}
  }else{download(await task,name);feedback(button.dataset.shareAction==='copy'?'此浏览器不支持复制图片，已下载 PNG':'PNG 图片已下载')}
 }catch(error){feedback('生成图片失败：'+(error.message||'请重试'))}finally{rendering=false;buttons.forEach(n=>n.disabled=false)}
});
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;install()})}).observe(document.body,{childList:true,subtree:true});install();
