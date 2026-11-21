export const prefixColors={blue:['#2862f5','#edf3ff'],green:['#008d6b','#e5f6f0'],purple:['#8754d9','#f1ebff'],orange:['#b96808','#fff1dc'],pink:['#bc387e','#fdeaf4'],cyan:['#067f97','#e5f7fc']};
export function prefixColor(prefix){let hash=0;for(const char of prefix)hash=(hash*31+char.codePointAt(0))>>>0;return Object.keys(prefixColors)[hash%Object.keys(prefixColors).length]}
export function normalizePrefixes(value){
 const entries={};if(value?.entries&&typeof value.entries==='object'&&!Array.isArray(value.entries))for(const [id,row]of Object.entries(value.entries)){
  if(!row||typeof row.prefix!=='string'||!id||id.length>200)continue;
  const prefix=row.prefix.replace(/[〔〕\r\n]/g,'').trim().slice(0,24);if(!prefix)continue;
  Object.defineProperty(entries,id,{value:{prefix,color:Object.hasOwn(prefixColors,row.color)?row.color:prefixColor(prefix)},enumerable:true,writable:true,configurable:true});
 }
 return {version:1,enabled:value?.enabled!==false,entries};
}
export function teamDisplayName(team,config){const name=team.originalName??team.name,row=Object.hasOwn(config.entries,team.id)?config.entries[team.id]:null;return config.enabled&&row?`〔${row.prefix}〕${name}`:name}
export function withTeamPrefixes(data,config){return data?{...data,teams:(data.teams??[]).map(team=>({...team,originalName:team.originalName??team.name,name:teamDisplayName(team,config)}))}:data}
