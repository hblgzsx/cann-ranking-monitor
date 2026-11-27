import {defaultRegions,confirmedRegionTeams,defaultMembership,rosterVersion} from './default-regions.mjs?v=20261127-insights';
export const prefixColors={blue:['#2862f5','#edf3ff'],green:['#008d6b','#e5f6f0'],purple:['#8754d9','#f1ebff'],orange:['#b96808','#fff1dc'],pink:['#bc387e','#fdeaf4'],cyan:['#067f97','#e5f7fc']};
export function prefixColor(prefix){let hash=0;for(const char of prefix)hash=(hash*31+char.codePointAt(0))>>>0;return Object.keys(prefixColors)[hash%Object.keys(prefixColors).length]}
export function normalizePrefixes(value){
 const regions=[],assignments={},entries={},byId=new Map();
 const clean=name=>typeof name==='string'?name.replace(/[〔〕\r\n]/g,'').trim().slice(0,24):'';
 const put=(object,id,row)=>Object.defineProperty(object,id,{value:row,enumerable:true,writable:true,configurable:true});
 if(value?.version===2&&Array.isArray(value.regions)){
  for(const row of value.regions){const name=clean(row?.name);if(!name)continue;let id=String(row.id??'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||id==='__unassigned__'||byId.has(id))continue;const region={id,name,color:Object.hasOwn(prefixColors,row.color)?row.color:prefixColor(name)};regions.push(region);byId.set(id,region)}
  if(value.assignments&&typeof value.assignments==='object'&&!Array.isArray(value.assignments))for(const [teamId,regionId]of Object.entries(value.assignments))if(teamId&&teamId.length<=200&&byId.has(regionId))put(assignments,teamId,regionId);
 }else if(value?.entries&&typeof value.entries==='object'&&!Array.isArray(value.entries)){
  const grouped=new Map();for(const [teamId,row]of Object.entries(value.entries)){
   if(!teamId||teamId.length>200)continue;const name=clean(row?.prefix);if(!name)continue;const color=Object.hasOwn(prefixColors,row.color)?row.color:prefixColor(name),key=JSON.stringify([name,color]);
   let region=grouped.get(key);if(!region){region={id:'region-'+(regions.length+1),name,color};regions.push(region);grouped.set(key,region);byId.set(region.id,region)}put(assignments,teamId,region.id);
  }
 }
 for(const [teamId,regionId]of Object.entries(assignments)){const region=byId.get(regionId);put(entries,teamId,{prefix:region.name,color:region.color})}
 return {version:2,enabled:value?.enabled!==false,regions,assignments,entries,rosterVersion:typeof value?.rosterVersion==='string'?value.rosterVersion:null,unassignedTeamIds:[...new Set((Array.isArray(value?.unassignedTeamIds)?value.unassignedTeamIds:[]).filter(id=>typeof id==='string'&&id.length<=200&&!Object.hasOwn(assignments,id)))]};
}
export const prefixStorageKey='cann-monitor:team-prefixes';
export const prefixBackupKey=prefixStorageKey+':before-regions-v2';
export const rosterBackupKey=prefixStorageKey+':before-default-roster-20261127';
export function withDefaultRegions(value,teams=[],force=false){
 const config=normalizePrefixes(value),first=force||config.rosterVersion!==rosterVersion;
 if(first){
  const standard=new Set(defaultRegions.map(r=>'default-'+r.id));
  config.regions=[...defaultRegions.map(r=>({id:'default-'+r.id,name:r.name,color:r.color})),...config.regions.filter(r=>!standard.has(r.id))];
  for(const r of defaultRegions)for(const m of r.members)if(m.teamId){config.assignments[m.teamId]='default-'+r.id;config.unassignedTeamIds=config.unassignedTeamIds.filter(id=>id!==m.teamId)}
  config.rosterVersion=rosterVersion;
 }
 for(const team of [...teams,...defaultRegions.flatMap(r=>r.members),...confirmedRegionTeams]){
  const id=team.id??team.teamId;if(!id||config.unassignedTeamIds.includes(id)||!first&&Object.hasOwn(config.assignments,id))continue;
  const member=defaultMembership({...team,id});if(member)config.assignments[id]='default-'+member.regionId;
 }
 return normalizePrefixes(config);
}
export function readDefaultRegions(storage,teams=[]){
 const config=migrateStoredPrefixes(storage),next=withDefaultRegions(config,teams),raw=storage.getItem(prefixStorageKey);
 if(JSON.stringify(next)!==JSON.stringify(config)){
  try{if(raw&&config.rosterVersion!==rosterVersion&&!storage.getItem(rosterBackupKey))storage.setItem(rosterBackupKey,raw);storage.setItem(prefixStorageKey,JSON.stringify(next))}catch{}
 }
 return next;
}
export function migrateStoredPrefixes(storage){
 const raw=storage.getItem(prefixStorageKey);let parsed;try{parsed=JSON.parse(raw)}catch{return normalizePrefixes(null)}const config=normalizePrefixes(parsed);
 if(parsed&&parsed.version!==2&&parsed.entries&&typeof parsed.entries==='object'){
  // Backup must succeed before replacing the user's only stored copy.
  try{if(!storage.getItem(prefixBackupKey))storage.setItem(prefixBackupKey,raw);storage.setItem(prefixStorageKey,JSON.stringify(config))}catch{}
 }
 return config;
}
export function regionMatches(config,teamId,regionId=''){return !regionId||(regionId==='__unassigned__'?!Object.hasOwn(config.assignments,teamId):config.assignments[teamId]===regionId)}
export function teamDisplayName(team,config){const name=team.originalName??team.name,row=Object.hasOwn(config.entries,team.id)?config.entries[team.id]:null;return config.enabled&&row?`〔${row.prefix}〕${name}`:name}
export function withTeamPrefixes(data,config){return data?{...data,teams:(data.teams??[]).map(team=>({...team,originalName:team.originalName??team.name,name:teamDisplayName(team,config)}))}:data}
