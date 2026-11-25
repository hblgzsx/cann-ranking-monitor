import test from 'node:test';import assert from 'node:assert/strict';
import {caseNumber,caseColumns,visibleCaseIndices} from '../lib/case-display.mjs';
test('case presentation labels identify points without treating times, IDs or totals as cases',()=>{
 for(const [label,index]of [['测试点 01',0],['点 13 · 看图',12],['点 2 ↑',1],['case13',12],['CASE 4',3]])assert.equal(caseNumber(label),index);
 for(const label of ['测试点','13 / 13','6b0520f485','12.34 μs','总分 91','点 0'])assert.equal(caseNumber(label),null);
});
test('all cases are visible by default; subsets follow case identity across additions and reordering',()=>{
 const ids=['a','b','c'];assert.deepEqual(visibleCaseIndices(ids),[0,1,2]);assert.deepEqual(visibleCaseIndices(ids,new Set()),[]);
 assert.deepEqual(visibleCaseIndices(['c','new','a','b'],new Set(['a','c'])),[0,2]);assert.deepEqual(visibleCaseIndices([...ids,'new']),[0,1,2,3]);
});
test('ranking case columns account for merged headers and exclude metadata columns',()=>{
 const cells=[{label:'排名'},{label:'队伍',span:2},{label:'有效点'},{label:'点 1'},{label:'点 13 ↓'},{label:'提交 ID / 时间'}];
 assert.deepEqual(caseColumns(cells),[{column:4,index:0},{column:5,index:12}]);
});
