import test from 'node:test';import assert from 'node:assert/strict';
import {normalizePrefixes,teamDisplayName,withTeamPrefixes,prefixColor,migrateStoredPrefixes,prefixStorageKey,prefixBackupKey,regionMatches} from '../lib/team-prefixes.mjs';
test('team prefixes survive renames, can hide and never stack or mutate source data',()=>{
 const config=normalizePrefixes({entries:{a:{prefix:'合肥赛区',color:'green'}}}),source={teams:[{id:'a',name:'甲队'},{id:'b',name:'乙队'}]};
 const shown=withTeamPrefixes(source,config);assert.equal(shown.teams[0].name,'〔合肥赛区〕甲队');assert.equal(source.teams[0].name,'甲队');assert.equal(withTeamPrefixes(shown,config).teams[0].name,shown.teams[0].name);assert.equal(withTeamPrefixes(shown,{...config,enabled:false}).teams[0].name,'甲队');assert.equal(teamDisplayName({id:'a',name:'新队名'},config),'〔合肥赛区〕新队名');assert.equal(shown.teams[1].name,'乙队');
});
test('prefix import normalizes fields, empty values remove a label and colors are deterministic',()=>{
 const config=normalizePrefixes({enabled:false,entries:{a:{prefix:' 〔北京〕\n ',color:'bad'},b:{prefix:'  '},c:{prefix:3}}});assert.equal(config.entries.a.prefix,'北京');assert.equal(config.enabled,false);assert.equal(config.entries.a.color,prefixColor('北京'));assert.equal(Object.keys(config.entries).length,1);assert.equal(normalizePrefixes(null).enabled,true);assert.equal(prefixColor('赛区'),prefixColor('赛区'));
});
test('legacy migration groups identical labels but preserves conflicting colors and original backup',()=>{
 const old={version:1,enabled:false,entries:{a:{prefix:'合肥',color:'green'},b:{prefix:'合肥',color:'green'},c:{prefix:'合肥',color:'blue'},d:{prefix:'北京',color:'purple'}}};
 const raw=JSON.stringify(old),values=new Map([[prefixStorageKey,raw]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const migrated=migrateStoredPrefixes(storage);assert.equal(migrated.version,2);assert.equal(migrated.enabled,false);assert.equal(migrated.regions.length,3);assert.equal(migrated.assignments.a,migrated.assignments.b);assert.notEqual(migrated.assignments.a,migrated.assignments.c);assert.deepEqual(migrated.entries,old.entries);assert.equal(values.get(prefixBackupKey),raw);
 assert.deepEqual(migrateStoredPrefixes(storage),migrated);assert.equal(values.get(prefixBackupKey),raw);
});
test('central region edits update every assigned team and preserve unused regions on export/import',()=>{
 let config=normalizePrefixes({entries:{a:{prefix:'合肥',color:'green'},b:{prefix:'合肥',color:'green'}}});const id=config.assignments.a;config.regions[0].name='华东';config.regions[0].color='orange';config.regions.push({id:'unused',name:'华北',color:'pink'});config=normalizePrefixes(JSON.parse(JSON.stringify(config)));
 assert.deepEqual(config.entries.a,{prefix:'华东',color:'orange'});assert.deepEqual(config.entries.b,config.entries.a);assert.equal(config.regions.length,2);assert.equal(config.assignments.a,id);assert.ok(regionMatches({...config,enabled:false},'a',id));assert.ok(!regionMatches(config,'a','__unassigned__'));assert.ok(regionMatches(config,'missing','__unassigned__'));
 const rank=[{id:'a',rank:1},{id:'missing',rank:2},{id:'b',rank:3}].filter(t=>regionMatches(config,t.id,id));assert.deepEqual(rank.map(t=>t.rank),[1,3]);
});
test('failed migration backup never overwrites legacy assignments',()=>{
 const raw=JSON.stringify({version:1,entries:{a:{prefix:'上海',color:'cyan'}}});let writes=0;
 const config=migrateStoredPrefixes({getItem:k=>k===prefixStorageKey?raw:null,setItem(){writes++;throw Error('quota')}});assert.equal(writes,1);assert.deepEqual(config.entries.a,{prefix:'上海',color:'cyan'});
});
