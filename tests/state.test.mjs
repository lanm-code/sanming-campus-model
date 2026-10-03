import test from 'node:test';
import assert from 'node:assert/strict';
import {buildings, indexedRooms} from '../src/data.js';
import {readState, writeState, searchCampus, isTap, STORAGE_KEY} from '../src/state.js';
const memory = value => ({getItem:()=>value,setItem:(key,v)=>{value=v;}});
test('source-backed room identifiers are unique, all unsurveyed locations stay null',()=>{
  assert.equal(new Set(indexedRooms.map(r=>r.id)).size,indexedRooms.length);
  assert(indexedRooms.every(r=>r.point===null && r.floor>=1 && r.floor<=6));
  assert.equal(indexedRooms.filter(r=>r.number==='408').length,2);
  assert.equal(buildings.find(b=>b.id==='boxue').rooms.length,0);
});
test('search finds alias, exact room number and real named room without fabrication',()=>{
  assert.equal(searchCampus(buildings,'图书馆')[0].building.id,'library');
  assert.equal(searchCampus(buildings,'401')[0].room.name,'公共机房（1）');
  assert.equal(searchCampus(buildings,'新闻演播厅')[0].room.floor,4);
  assert.deepEqual(searchCampus(buildings,'不存在的教室'),[]);
  assert.deepEqual(searchCampus(buildings,'401','service'),[]);
});
test('corrupted, obsolete or inaccessible storage never prevents opening the app',()=>{
  for(const value of ['{invalid','null','{"version":2}', '{"version":1,"selectedId":"unknown","favorites":"bad"}'])
    assert.equal(readState(memory(value), buildings).selectedId,null);
  assert.deepEqual(readState({getItem(){throw Error('denied');}},buildings).favorites,[]);
  assert.equal(writeState({setItem(){throw Error('quota');}},{}),false);
});
test('reload restores valid floor and room, discards stale room and favorite IDs',()=>{
  const value={version:1,selectedId:'experiment-index',floor:4,roomId:'index-4-401',favorites:['boxue','bad','boxue']};
  const storage=memory(JSON.stringify(value));
  assert.deepEqual(readState(storage,buildings),{...value,favorites:['boxue']});
  value.floor=5;
  assert.equal(readState(memory(JSON.stringify(value)),buildings).roomId,null);
});
test('drag, multi-touch, cancellation, long press and return-drag do not count as taps',()=>{
  const g={id:1,x:10,y:10,time:0,maxDistance:0,multi:false,cancelled:false};
  assert(isTap(g,1,12,11,100));
  assert(!isTap({...g,multi:true},1,10,10,100));
  assert(!isTap({...g,cancelled:true},1,10,10,100));
  assert(!isTap({...g,maxDistance:50},1,10,10,100));
  assert(!isTap(g,1,10,10,800));
  assert(!isTap(g,2,10,10,100));
});
