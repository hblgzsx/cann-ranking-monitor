import test from 'node:test';import assert from 'node:assert/strict';
import {normalizePrefixes,teamDisplayName,withTeamPrefixes,prefixColor} from '../lib/team-prefixes.mjs';
test('team prefixes survive renames, can hide and never stack or mutate source data',()=>{
 const config=normalizePrefixes({entries:{a:{prefix:'合肥赛区',color:'green'}}}),source={teams:[{id:'a',name:'甲队'},{id:'b',name:'乙队'}]};
 const shown=withTeamPrefixes(source,config);assert.equal(shown.teams[0].name,'〔合肥赛区〕甲队');assert.equal(source.teams[0].name,'甲队');assert.equal(withTeamPrefixes(shown,config).teams[0].name,shown.teams[0].name);assert.equal(withTeamPrefixes(shown,{...config,enabled:false}).teams[0].name,'甲队');assert.equal(teamDisplayName({id:'a',name:'新队名'},config),'〔合肥赛区〕新队名');assert.equal(shown.teams[1].name,'乙队');
});
test('prefix import normalizes fields, empty values remove a label and colors are deterministic',()=>{
 const config=normalizePrefixes({enabled:false,entries:{a:{prefix:' 〔北京〕\n ',color:'bad'},b:{prefix:'  '},c:{prefix:3}}});assert.equal(config.entries.a.prefix,'北京');assert.equal(config.enabled,false);assert.equal(config.entries.a.color,prefixColor('北京'));assert.equal(Object.keys(config.entries).length,1);assert.equal(normalizePrefixes(null).enabled,true);assert.equal(prefixColor('赛区'),prefixColor('赛区'));
});
