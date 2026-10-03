import test from 'node:test';
import assert from 'node:assert/strict';
import campus from '../src/campus-data.json' with {type:'json'};
import {buildings} from '../src/data.js';
import {polygonArea,subtractPolygonSegments} from '../src/geo.js';

// Winding angles independently check that the display envelope covers the traced roofs.
function contains(point,ring){
  let angle=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i].map((v,j)=>v-point[j]),b=ring[(i+1)%ring.length].map((v,j)=>v-point[j]);
    const cross=a[0]*b[1]-a[1]*b[0],dot=a[0]*b[0]+a[1]*b[1];
    if(Math.hypot(...a)<.01||Math.abs(cross)<.01&&dot<=0)return true;
    angle+=Math.atan2(cross,dot);
  }
  return Math.abs(angle)>Math.PI;
}

test('traced roofs stay finite, distinct and inside the modelling envelope',()=>{
  assert.equal(new Set(buildings.map(b=>b.id)).size,buildings.length);
  for(const b of campus.contextBuildings){
    assert.ok(b.points.flat().every(Number.isFinite),b.id+' invalid coordinate');
    assert.ok(polygonArea(b.points)>1,b.id+' collapsed roof');
    for(const p of b.points)assert.ok(contains(p,campus.workEnvelope),b.id+' outside display envelope');
  }
  assert.ok(buildings.filter(b=>b.model).every(b=>b.position.every(Number.isFinite)));
});

test('photo-supported landmark order and uncertain school boundary remain explicit',()=>{
  const point=id=>campus.coreBuildings.find(b=>b.id===id).position;
  assert.ok(point('administration')[1]<point('boxue')[1]);
  assert.ok(point('boxue')[1]<point('library')[1]);
  assert.ok(Math.abs(point('boxue')[0]-point('library')[0])<25);
  assert.equal(campus.workEnvelopeStatus,'modelling-envelope-not-campus-boundary');
  assert.equal(campus.boundaryStatus,'osm-candidate-not-official-cadastral');
  assert.ok(campus.areaSquareMeters<campus.publishedAreaSquareMeters*.5);
});

test('rendered road centre lines do not cross known context building interiors',()=>{
  for(const road of campus.roads)for(const [a,b] of road.segments){
    assert.ok([...a,...b].every(Number.isFinite));
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const outside=subtractPolygonSegments(a,b,campus.contextBuildings).reduce((sum,[p,q])=>sum+Math.hypot(q[0]-p[0],q[1]-p[1]),0);
    assert.ok(Math.abs(length-outside)<.001,'Road '+road.id+' crosses a roof');
  }
});
