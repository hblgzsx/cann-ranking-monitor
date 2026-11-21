const paths={
 refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7z"/>',
 external:'<path d="M14 4h6v6M20 4 10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
 fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
 theme:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16" fill="currentColor"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.5 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.5 6.3-.9z"/>',
 pin:'<path d="m9 3 9 9-3 1-4 4-1 3-6-6 3-1 4-4zM7 17l-4 4"/>',
 dashboard:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12m4-8h4m-4 4h4"/>',
 chart:'<path d="M4 3v17h17M8 14l4-4 4 2 5-7"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
 cases:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 history:'<path d="M3 4v5h5M4 9a9 9 0 1 1 0 7M12 7v5l3 2"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',bolt:'<path d="m13 2-9 12h7l-1 8L21 9h-8z"/>',link:'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 5 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 -1)"/>',
 brand:'<path d="M16 6a8 8 0 1 0 0 12"/><path d="m9 15 11-11m-6 0h6v6"/>'
};
export const icon=name=>`<svg class="ui-icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]??paths.chart}</svg>`;
const glyphs={'↻':'refresh','Ⅱ':'pause','▷':'play','↗':'external','↓':'download','⛶':'fullscreen','⤢':'fullscreen','◐':'theme','×':'close','⌕':'search','☆':'star','★':'star','↑':'pin','▥':'dashboard','♧':'users','⊞':'cases','◷':'history','⌄':'chevron','ϟ':'bolt'};
const targets='.brand-icon,.stat-label>span,.search>span,.rules summary>span,nav a,.dashboard-entry a,.button,.icon-button,.star,.quiet-button';
function decorate(root){
 const nodes=[...(root.matches?.(targets)?[root]:[]),...root.querySelectorAll?.(targets)??[]];
 for(const node of nodes){
  if(node.matches('.brand-icon')){if(!node.querySelector('svg'))node.innerHTML=icon('brand');continue}
  for(const text of [...node.childNodes].filter(n=>n.nodeType===3)){
   const source=text.textContent;if(!Object.keys(glyphs).some(g=>source.includes(g)))continue;
   const fragment=document.createDocumentFragment();let buffer='';
   for(const char of source){if(glyphs[char]){if(buffer)fragment.append(document.createTextNode(buffer));buffer='';const wrap=document.createElement('span');wrap.innerHTML=icon(char==='↗'&&node.matches('.stat-label>span')?'chart':glyphs[char]);const svg=wrap.firstChild;if(char==='★')svg.classList.add('icon-filled');fragment.append(svg)}else buffer+=char}
   if(buffer)fragment.append(document.createTextNode(buffer));text.replaceWith(fragment);
  }
 }
}
export function installIcons(){decorate(document);new MutationObserver(changes=>{const roots=new Set();for(const c of changes){if(c.type==='characterData')roots.add(c.target.parentElement);else roots.add(c.target)}for(const root of roots)if(root?.isConnected&&!root.closest?.('svg'))decorate(root)}).observe(document.body,{childList:true,subtree:true,characterData:true})}
