import test from 'node:test';
import assert from 'node:assert/strict';
import campus from '../src/campus-data.json' with {type:'json'};
import {containsPoint,compileTerrain} from '../src/surface.js';
import {polygonBounds,polygonArea,subtractPolygonSegments} from '../src/geo.js';

const core=id=>campus.coreBuildings.find(b=>b.id===id),height=compileTerrain(campus.surface);
const center=part=>{const b=polygonBounds(part.points);return [(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2];};
const solids=b=>b.structure.body?[b.structure.body]:b.structure.parts;

test('library matches photo58 viewed from the road: south low, north high, door east, open rear west',()=>{
  const b=core('library'),s=b.structure,n=s.parts.find(p=>p.id==='north-wing'),south=s.parts.find(p=>p.id==='south-wing'),rear=s.parts.find(p=>p.role==='open-understorey'),entry=s.entries[0];
  assert.ok(n.height>south.height);
  assert.ok(center(n)[1]<center(south)[1]);
  assert.deepEqual(entry.normal,[1,0]);
  assert.ok(entry.point[0]>Math.max(center(n)[0],center(south)[0]));
  assert.ok(center(rear)[0]<center(n)[0]);
  assert.ok(rear.openLowerHeight>0&&!rear.lowerSolid);
  assert.ok(s.parts.find(p=>p.role==='entrance-hall').lowerSolid,'entrance hall must not float above the western ground');
  assert.ok(s.parts.some(p=>p.role==='connecting-body'),'unverified green courtyard must not replace the central roof mass');
  assert.equal(b.measuredElevation,null);
});

test('Boxue has unequal wings, eastern spine and two open westward courtyards from photo66',()=>{
  const s=core('boxue').structure;
  assert.equal(s.wings.length,3);
  const widths=s.wings.map(p=>{const b=polygonBounds(p.points);return b.maxX-b.minX;});
  assert.ok(widths[0]<widths[1]*.8,'north wing must not become another full-length bar');
  const positions=s.wings.map(center);
  assert.ok(positions[0][1]<positions[1][1]&&positions[1][1]<positions[2][1]);
  for(const p of s.courtyardProbes){
    assert.equal(containsPoint(p,s.body.points),false,'courtyard filled by body');
    const west=[polygonBounds(s.body.points).minX-10,p[1]];
    const distance=Math.hypot(west[0]-p[0],west[1]-p[1]),open=subtractPolygonSegments(p,west,[s.body]).reduce((sum,[a,b])=>sum+Math.hypot(a[0]-b[0],a[1]-b[1]),0);
    assert.ok(Math.abs(open-distance)<.01,'western courtyard opening closed');
  }
  assert.equal(s.steps.length,0,'a fabricated long staircase must not replace the 2F forecourt');
});

test('doors face the outside of the traced bodies and core geometry stays inside the scene frame',()=>{
  for(const b of campus.coreBuildings.filter(b=>b.structure)){
    for(const p of [...solids(b),...b.structure.platforms]){
      assert.ok(polygonArea(p.points)>1);
      assert.ok(p.points.every(q=>q.every(Number.isFinite)&&containsPoint(q,campus.workEnvelope)));
    }
    for(const entry of b.structure.entries){
      const outside=entry.point.map((v,i)=>v+entry.normal[i]*.5);
      assert.ok(solids(b).every(part=>!containsPoint(outside,part.points)),b.id+' '+entry.id+' points inside the body');
      assert.ok(solids(b).some(part=>entry.portalPoints.some(p=>containsPoint(p,part.points))),b.id+' '+entry.id+' portal detached from the body');
    }
  }
});

test('entry display terrain keeps the Boxue rear lower and the library western understorey open',()=>{
  const boxue=core('boxue'),front=boxue.structure.entries.find(e=>e.id==='main-2f'),rear=boxue.structure.entries.find(e=>e.id==='rear-1f');
  const frontGround=front.point.map((v,i)=>v+front.normal[i]),rearGround=rear.point.map((v,i)=>v+rear.normal[i]);
  assert.ok(Math.abs(height(...frontGround)-front.base)<.05);
  assert.ok(height(...rearGround)<.1,'old full-width front terrace buries the west 1F door');
  const lib=core('library'),entry=lib.structure.entries[0],e=entry.point.map((v,i)=>v+entry.normal[i]);
  assert.ok(Math.abs(height(...e)-lib.displayElevation)<.05,'east entrance terrace still on the wrong side');
  const back=lib.structure.parts.find(p=>p.role==='open-understorey');
  assert.ok(height(...back.points[7])<.1,'rear lower space filled by the entrance terrace');
});
