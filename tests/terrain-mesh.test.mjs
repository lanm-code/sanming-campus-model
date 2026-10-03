import test from 'node:test';
import assert from 'node:assert/strict';
import campus from '../src/campus-data.json' with {type:'json'};
import {compileTerrain,containsPoint} from '../src/surface.js';
import {createTerrainTriangles,createMeshHeightSampler} from '../src/terrain-mesh.js';

const height=compileTerrain(campus.surface);

test('road draping samples sloped mesh faces and falls back only outside them',()=>{
  const sample=createMeshHeightSampler(new Float32Array([0,0,0,10,10,0,0,0,10,10,10,0,10,10,10,0,0,10]),()=>-3,5);
  assert.equal(sample(2,2),2);assert.equal(sample(8,8),8);assert.equal(sample(5,5),5);
  assert.equal(sample(-1,2),-3);assert.equal(sample(15,5),-3);
});

test('mesh draping rejects malformed buffers and invalid query coordinates',()=>{
  assert.throws(()=>createMeshHeightSampler([1,2],()=>0),TypeError);
  assert.throws(()=>createMeshHeightSampler([0,NaN,0,1,0,0,0,0,1],()=>0),TypeError);
  const sample=createMeshHeightSampler([0,0,0,1,0,0,0,0,1],()=>0);
  assert.throws(()=>sample(Infinity,0),TypeError);
});
const triangles=createTerrainTriangles(campus.campusBoundary,campus.surface).map(points=>({points,heights:points.map(p=>height(...p)),minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))}));
// Independently interpolate the actual faces, rather than testing only the sampler.
function meshHeight(x,z){
  for(const f of triangles){
    if(x<f.minX-1e-6||x>f.maxX+1e-6||z<f.minZ-1e-6||z>f.maxZ+1e-6)continue;
    const [a,b,c]=f.points,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(z-c[1]))/det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(z-c[1]))/det,w=1-u-v;
    if(Math.min(u,v,w)>=-1e-6)return u*f.heights[0]+v*f.heights[1]+w*f.heights[2];
  }
  return undefined;
}

test('reference outline contains landmarks and excludes eastern construction and outside field',()=>{
  assert.equal(campus.campusBoundaryStatus,'user-map-reference-not-surveyed');
  for(const b of campus.coreBuildings)assert.ok(containsPoint(b.position,campus.campusBoundary));
  assert.equal(containsPoint([200,600],campus.campusBoundary),false);
  const field=campus.sportsAreas.find(a=>a.id==='east-field');
  assert.equal(field.scopeStatus,'outside-reference');
  assert.ok(field.points.every(p=>!containsPoint(p,campus.campusBoundary)));
});

test('actual mesh exposes every declared step and connects both staircase ends',()=>{
  for(const s of campus.surface.stairs){
    for(let i=0;i<s.steps;i++){
      const t=(i+.5)/s.steps,x=s.from[0]+(s.to[0]-s.from[0])*t,z=s.from[1]+(s.to[1]-s.from[1])*t;
      const stepTop=s.fromHeight+(s.toHeight-s.fromHeight)*(s.toHeight>s.fromHeight?(i+1)/s.steps:i/s.steps)+.18;
      assert.ok(meshHeight(x,z)+.06<stepTop,s.id+' buried step '+i);
    }
    assert.ok(Math.abs(meshHeight(...s.from)-s.fromHeight)<.2,s.id+' lower landing');
    assert.ok(Math.abs(meshHeight(...s.to)-s.toHeight)<.2,s.id+' upper landing');
  }
});

test('ramps follow their visible grade and bridge approaches leave the underpass low',()=>{
  for(const r of campus.surface.ramps)for(let i=0;i<=12;i++){
    const t=i/12,x=r.from[0]+(r.to[0]-r.from[0])*t,z=r.from[1]+(r.to[1]-r.from[1])*t,target=r.fromHeight*(1-t)+r.toHeight*t;
    assert.ok(Math.abs(meshHeight(x,z)-target)<.2,r.id+' buried or floating');
  }
  for(const b of campus.surface.bridges){
    assert.ok(Math.abs(meshHeight(...b.from)-b.fromHeight)<.2);
    assert.ok(Math.abs(meshHeight(...b.to)-b.toHeight)<.2);
    const middle=b.from.map((v,i)=>(v+b.to[i])/2);
    assert.ok(meshHeight(...middle)<b.lowerSurfaceHeight+.1,'bridge underpass filled');
  }
});

test('pool edges and neighbouring low building walls meet their terrain',()=>{
  const pool=campus.sports.find(s=>s.id===1259713856);
  for(const p of pool.points)assert.ok(Math.abs(meshHeight(...p)-8)<.25,'pool edge floats');
  for(const b of campus.contextBuildings.filter(b=>['N06','N07','N09'].includes(b.id)))for(const p of b.points){
    if(containsPoint(p,campus.campusBoundary))assert.ok(Math.abs(meshHeight(...p)-b.displayElevation)<.25,b.id+' wall is buried');
  }
  assert.ok(triangles.length<150000);
});
