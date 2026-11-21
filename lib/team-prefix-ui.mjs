import {normalizePrefixes,withTeamPrefixes,migrateStoredPrefixes,regionMatches} from './team-prefixes.mjs?v=20261122-regions';
import {initRegionManager} from './region-manager.mjs?v=20261122-regions';
let refreshRegionFilter=()=>{};
export function readPrefixes(){try{return migrateStoredPrefixes(localStorage)}catch{return normalizePrefixes(null)}}
export const currentRegionFilter=()=>document.querySelector('#region-filter')?.value??'';
export const teamInSelectedRegion=id=>regionMatches(readPrefixes(),id,currentRegionFilter());
export function prefixData(data){const result=withTeamPrefixes(data,readPrefixes());refreshRegionFilter(result);return result}
export function initTeamPrefixes({getData,onChange}){
 const manager=initRegionManager({getData,getConfig:readPrefixes,onChange:()=>{onChange();decorate(document.body)}});refreshRegionFilter=manager.refreshFilter;
 function decorate(root){
  // Convert only configured prefix tokens in rendered text; options and editable fields stay plain text.
  const config=readPrefixes(),tokens=new Map(Object.values(config.entries).map(row=>[`〔${row.prefix}〕`,row]));
  const named=(getData()?.teams??[]).flatMap(t=>{const row=config.entries[t.id];return row?[{text:`〔${row.prefix}〕${t.originalName??t.name}`,row}]:[]}).sort((a,b)=>b.text.length-a.text.length);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const parent=node.parentElement;if(!parent||parent.closest('script,style,option,textarea,input,.prefix-editor,.team-region-badge,svg'))continue;const source=node.textContent;if(!source.includes('〔'))continue;const regex=/〔[^〕]{1,24}〕/g;let match,last=0,changed=false;const fragment=document.createDocumentFragment();while((match=regex.exec(source))){const row=named.find(item=>source.slice(match.index).startsWith(item.text))?.row??tokens.get(match[0]);if(!row)continue;fragment.append(document.createTextNode(source.slice(last,match.index)));const badge=document.createElement('span');badge.className='team-region-badge';badge.dataset.regionColor=row.color;badge.textContent=row.prefix;badge.title='手动设置的赛区标签';fragment.append(badge);last=regex.lastIndex;changed=true}if(changed){fragment.append(document.createTextNode(source.slice(last)));node.replaceWith(fragment)}}
 }
 let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;observer.disconnect();decorate(document.body);observer.observe(document.body,{childList:true,subtree:true,characterData:true})})});observer.observe(document.body,{childList:true,subtree:true,characterData:true});decorate(document.body);
}
