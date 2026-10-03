import test from 'node:test';
import assert from 'node:assert/strict';
import {SURFACE_HEIGHT_KIND,containsPoint,intersectConvexPolygons,sampleTerrain,compileTerrain,subdivideTriangle} from '../src/surface.js';

const square=(minX,minZ,maxX,maxZ)=>[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]];
const terrace=(height,bounds={minX:-10,maxX:10,minZ:-10,maxZ:10},feather=10)=>({coreBounds:bounds,height,feather});

test('a low building core wins over another building feather',()=>{
  const surface={buildingPads:[{center:[0,0],halfWidth:2,halfDepth:2,height:0,feather:3},{center:[8,0],halfWidth:2,halfDepth:2,height:8,feather:10}]};
  for(const sampler of [sampleTerrain,(x,z,s)=>compileTerrain(s)(x,z)])assert.equal(sampler(1,0,surface),0);
});

test('a declared low grade core wins over a neighbouring feather',()=>{
  const surface={terraces:[terrace(8)],gradeCorridors:[{from:[-5,0],to:[5,0],fromHeight:0,toHeight:0,width:2,feather:2},{from:[-5,5],to:[5,5],fromHeight:8,toHeight:8,width:2,feather:10}]};
  assert.equal(sampleTerrain(0,0,surface),0);assert.equal(compileTerrain(surface)(0,0),0);
});
const signedArea=([a,b,c])=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

test('heights explicitly describe display offsets and unknown terrain returns zero',()=>{
  assert.equal(SURFACE_HEIGHT_KIND,'display-only');
  assert.equal(sampleTerrain(123,-456),0);
  assert.equal(sampleTerrain(123,-456,{terraces:[],levelAreas:[],buildingPads:[]}),0);
});

test('rectangular terrace core is flat, including its full boundary',()=>{
  const surface={terraces:[terrace(8)]};
  for(const [x,z] of [[0,0],[-10,-10],[10,10],[-10,5],[4,10]])assert.equal(sampleTerrain(x,z,surface),8);
  assert.equal(sampleTerrain(20,0,surface),0);
  assert.equal(sampleTerrain(100,100,surface),0);
  assert.equal(sampleTerrain(18,18,surface),0);
});

test('feathered slopes are continuous with flat slopes at the core and exterior',()=>{
  const surface={terraces:[terrace(8)]},epsilon=1e-4;
  near(sampleTerrain(15,0,surface),4);
  assert.ok(sampleTerrain(12,0,surface)>sampleTerrain(15,0,surface));
  assert.ok(sampleTerrain(15,0,surface)>sampleTerrain(18,0,surface));
  near(sampleTerrain(10-epsilon,0,surface),sampleTerrain(10+epsilon,0,surface),1e-8);
  near(sampleTerrain(20-epsilon,0,surface),sampleTerrain(20+epsilon,0,surface),1e-8);
  near(sampleTerrain(10+Math.SQRT1_2*5,10+Math.SQRT1_2*5,surface),4);
});

test('overlapping terraces select the greater height without depending on input order',()=>{
  const lower=terrace(3),upper=terrace(8,{minX:0,maxX:20,minZ:-10,maxZ:10});
  for(const terraces of [[lower,upper],[upper,lower]]){
    assert.equal(sampleTerrain(5,0,{terraces}),8);
    assert.equal(sampleTerrain(-10,0,{terraces}),3);
    assert.equal(sampleTerrain(15,0,{terraces}),8);
  }
  // A negative display offset is valid and is not clamped to the datum.
  assert.equal(sampleTerrain(0,0,{terraces:[terrace(-4)]}),-4);
  near(sampleTerrain(15,0,{terraces:[terrace(-4)]}),-2);
});

test('polygon containment follows concavities and includes edges and vertices',()=>{
  const ring=[[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]];
  assert.equal(containsPoint([1,5],ring),true);
  assert.equal(containsPoint([3,5],ring),false);
  assert.equal(containsPoint([3,1],ring),true);
  assert.equal(containsPoint([3,2],ring),true);
  assert.equal(containsPoint([2,2],ring),true);
  assert.equal(containsPoint([6,3],ring),true);
  assert.equal(containsPoint([6.000001,3],ring),false);
  assert.equal(containsPoint([1,5],ring.toReversed()),true);
  assert.equal(containsPoint([0,0],[...ring,ring[0]]),true);
});

test('level areas flatten only their polygon and override a surrounding terrace',()=>{
  const points=[[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]];
  const surface={terraces:[terrace(8)],levelAreas:[{points,height:2}]};
  assert.equal(sampleTerrain(1,5,surface),2);
  assert.equal(sampleTerrain(3,5,surface),8);
  assert.equal(sampleTerrain(3,2,surface),2);
  assert.equal(sampleTerrain(-1,3,surface),8);
  assert.equal(sampleTerrain(1,1,{levelAreas:[{points,height:-2},{points:square(0,0,2,2),height:4}]}),4);
});

test('final building pads anchor a flat core and blend back to underlying terrain',()=>{
  const surface={terraces:[terrace(8)],levelAreas:[{points:square(-8,-8,8,8),height:4}],buildingPads:[{center:[0,0],height:6,halfWidth:2,halfDepth:3,feather:4}]};
  assert.equal(sampleTerrain(0,0,surface),6);
  assert.equal(sampleTerrain(2,3,surface),6);
  near(sampleTerrain(4,0,surface),5);
  assert.equal(sampleTerrain(6,0,surface),4);
  assert.equal(sampleTerrain(9,0,surface),8);
});

test('separate upper and lower entry areas preserve their relative display heights',()=>{
  const surface={levelAreas:[{points:square(-10,0,10,8),height:3.5},{points:square(-10,-8,10,-1),height:0}]};
  assert.equal(sampleTerrain(0,4,surface)-sampleTerrain(0,-4,surface),3.5);
  assert.equal(sampleTerrain(50,50,surface),0);
});

test('longest-edge subdivision produces two triangles for a single required split',()=>{
  const original=[[0,0],[20,0],[10,1]], snapshot=structuredClone(original);
  const pieces=subdivideTriangle(...original,15);
  assert.equal(pieces.length,2);
  assert.deepEqual(original,snapshot);
  near(pieces.reduce((sum,triangle)=>sum+signedArea(triangle),0),signedArea(original));
  assert.deepEqual(subdivideTriangle([0,0],[2,0],[0,2]),[[[0,0],[2,0],[0,2]]]);
});

test('mesh subdivision preserves area and winding while bounding every edge',()=>{
  for(const original of [[[0,0],[120,0],[8,75]],[[8,75],[120,0],[0,0]],[[11,13],[111,14],[111,16]]]){
    const pieces=subdivideTriangle(...original,18);
    assert.ok(pieces.length>2&&pieces.length<1000);
    near(pieces.reduce((sum,triangle)=>sum+signedArea(triangle),0),signedArea(original),1e-8);
    for(const triangle of pieces){
      assert.equal(Math.sign(signedArea(triangle)),Math.sign(signedArea(original)));
      for(let i=0;i<3;i++)assert.ok(Math.hypot(triangle[i][0]-triangle[(i+1)%3][0],triangle[i][1]-triangle[(i+1)%3][1])<=18);
    }
  }
});

test('geometry rejects nonfinite and malformed inputs and excessive subdivision',()=>{
  assert.throws(()=>containsPoint([NaN,0],square(0,0,1,1)),TypeError);
  assert.throws(()=>containsPoint([0,0],[[0,0],[1,0]]),TypeError);
  assert.throws(()=>containsPoint([0,0],[[0,0],[1,0],[0,Infinity]]),TypeError);
  assert.throws(()=>sampleTerrain(Infinity,0),TypeError);
  assert.throws(()=>sampleTerrain(0,0,null),TypeError);
  assert.throws(()=>sampleTerrain(0,0,{terraces:{}}),TypeError);
  assert.throws(()=>sampleTerrain(0,0,{terraces:[terrace(NaN)]}),TypeError);
  assert.throws(()=>sampleTerrain(0,0,{terraces:[terrace(2,undefined,-1)]}),TypeError);
  assert.throws(()=>sampleTerrain(0,0,{terraces:[terrace(2,{minX:1,maxX:0,minZ:0,maxZ:1})]}),RangeError);
  assert.throws(()=>sampleTerrain(0,0,{buildingPads:[{center:[0,0],height:2,halfWidth:0,halfDepth:1}]}),RangeError);
  assert.throws(()=>sampleTerrain(0,0,{levelAreas:[{points:square(0,0,1,1),height:Infinity}]}),TypeError);
  assert.throws(()=>subdivideTriangle([0,0],[NaN,0],[0,1]),TypeError);
  for(const maxEdge of [0,-1,NaN,Infinity])assert.throws(()=>subdivideTriangle([0,0],[1,0],[0,1],maxEdge),RangeError);
  assert.throws(()=>subdivideTriangle([0,0],[1e10,0],[0,1],0.001),RangeError);
  assert.throws(()=>subdivideTriangle([-Number.MAX_VALUE,0],[Number.MAX_VALUE,0],[0,1]),RangeError);
});

const ringArea=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;

test('triangle intersection retains crossing points and accepts either winding',()=>{
  const subject=[[0,0],[6,0],[0,6]],clip=[[2,-2],[8,4],[2,10]];
  for(const a of [subject,subject.toReversed()])for(const b of [clip,clip.toReversed()]){
    const result=intersectConvexPolygons(a,b);
    assert.equal(result.length,4);
    near(ringArea(result),7);
    for(const expected of [[2,0],[4,0],[5,1],[2,4]])assert.ok(result.some(point=>Math.hypot(point[0]-expected[0],point[1]-expected[1])<1e-9));
    assert.notDeepEqual(result[0],result.at(-1));
    assert.ok(result.every(point=>containsPoint(point,a)&&containsPoint(point,b)));
    near(ringArea(intersectConvexPolygons(b,a)),7);
  }
});

test('convex clipping handles a six-vertex intersection without losing land area',()=>{
  const a=[[-3,-1],[3,-1],[0,5]],b=[[-3,3],[3,3],[0,-3]];
  const intersection=intersectConvexPolygons(a,b);
  assert.equal(intersection.length,6);
  near(ringArea(intersection),12);
  assert.ok(intersection.every(point=>containsPoint(point,a)&&containsPoint(point,b)));
});

test('contained and identical polygons retain their complete interior and do not mutate inputs',()=>{
  const outer=square(-10,-10,10,10),inner=[[0,0],[2,0],[0,2]],snapshot=structuredClone([outer,inner]);
  near(ringArea(intersectConvexPolygons(outer,inner)),2);
  near(ringArea(intersectConvexPolygons(inner,outer)),2);
  near(ringArea(intersectConvexPolygons([...outer,outer[0]],outer.toReversed())),400);
  assert.deepEqual([outer,inner],snapshot);
});

test('disjoint polygons and contact along only an edge or vertex have no fill',()=>{
  const triangle=[[0,0],[4,0],[0,4]];
  assert.deepEqual(intersectConvexPolygons(triangle,[[10,10],[14,10],[10,14]]),[]);
  assert.deepEqual(intersectConvexPolygons(triangle,[[0,0],[4,0],[0,-4]]),[]);
  assert.deepEqual(intersectConvexPolygons(triangle,[[4,0],[8,0],[4,4]]),[]);
  assert.deepEqual(intersectConvexPolygons(triangle,[[3,3],[6,3],[3,6]]),[]);
  assert.deepEqual(intersectConvexPolygons(triangle,[[1,1],[2,2],[3,3]]),[]);
  assert.deepEqual(intersectConvexPolygons([],triangle),[]);
});

test('intersection keeps small nonzero slivers and translated coordinates stable',()=>{
  const a=[[0,0],[4,0],[0,4]],b=[[3.999,0],[8,0],[3.999,4]];
  near(ringArea(intersectConvexPolygons(a,b)),0.0000005,1e-10);
  const shift=ring=>ring.map(([x,z])=>[x+117000,z-260000]);
  const moved=intersectConvexPolygons(shift(a),shift(b)).map(([x,z])=>[x-117000,z+260000]);
  near(ringArea(moved),0.0000005,1e-10);
});

test('intersection rejects malformed, nonfinite and concave input',()=>{
  assert.throws(()=>intersectConvexPolygons(null,square(0,0,2,2)),TypeError);
  assert.throws(()=>intersectConvexPolygons([[0,0],[1,0],[0,Infinity]],square(0,0,2,2)),TypeError);
  assert.throws(()=>intersectConvexPolygons([[0,0],[4,0],[1,1],[4,4],[0,4]],square(0,0,4,4)),RangeError);
});

test('grade corridor interpolates endpoint heights in its full central width',()=>{
  const surface={gradeCorridors:[{from:[0,0],to:[20,0],fromHeight:0,toHeight:4,width:4,feather:4}]};
  assert.equal(sampleTerrain(0,0,surface),0);
  assert.equal(sampleTerrain(20,0,surface),4);
  assert.equal(sampleTerrain(10,2,surface),2);
  near(sampleTerrain(10,4,surface),1);
  assert.equal(sampleTerrain(10,6,surface),0);
  near(sampleTerrain(22,0,surface),2);
  assert.equal(sampleTerrain(24,0,surface),0);
  // The higher bridge deck continues past the approach; its ground is unchanged.
  assert.equal(sampleTerrain(30,0,surface),0);
  near(sampleTerrain(10,2+1e-4,surface),sampleTerrain(10,2-1e-4,surface),1e-8);
});

test('grade corridor lowers terrace and pad heights so stairs remain exposed',()=>{
  const surface={terraces:[terrace(8)],buildingPads:[{center:[0,0],height:12,halfWidth:10,halfDepth:10}],gradeCorridors:[{from:[-10,0],to:[10,0],fromHeight:0,toHeight:4,width:4,feather:4}]};
  assert.equal(sampleTerrain(-10,0,surface),0);
  assert.equal(sampleTerrain(0,0,surface),2);
  assert.equal(sampleTerrain(10,0,surface),4);
  near(sampleTerrain(0,4,surface),7);
  assert.equal(sampleTerrain(0,6,surface),12);
});

test('overlapping and diagonal corridors stay local and select the greater candidate',()=>{
  const low={from:[0,0],to:[10,10],fromHeight:0,toHeight:4,width:2,feather:2};
  const high={...low,fromHeight:2,toHeight:6};
  for(const gradeCorridors of [[low,high],[high,low]]){
    near(sampleTerrain(5,5,{gradeCorridors}),4);
    assert.equal(sampleTerrain(10,0,{gradeCorridors}),0);
    assert.equal(sampleTerrain(15,15,{gradeCorridors}),0);
  }
});

test('compiled sampler matches all layers, snapshots configuration and marks display-only',()=>{
  const surface={terraces:[terrace(8)],levelAreas:[{points:square(-5,-5,5,5),height:3}],buildingPads:[{center:[-4,0],height:5,halfWidth:2,halfDepth:2,feather:2}],gradeCorridors:[{from:[0,0],to:[10,0],fromHeight:1,toHeight:4,width:2,feather:2}]};
  const compiled=compileTerrain(surface);
  assert.equal(compiled.heightKind,'display-only');
  for(const [x,z] of [[0,0],[-4,0],[5,2],[0,4],[15,0],[30,30]])near(compiled(x,z),sampleTerrain(x,z,surface));
  const before=compiled(0,0);
  surface.gradeCorridors[0].fromHeight=99;
  surface.gradeCorridors[0].from[0]=100;
  surface.terraces[0].height=99;
  surface.levelAreas[0].points[0][0]=-100;
  assert.equal(compiled(0,0),before);
  assert.throws(()=>compiled(NaN,0),TypeError);
});

test('grade corridor validation rejects impossible dimensions and heights before compilation',()=>{
  const corridor={from:[0,0],to:[10,0],fromHeight:0,toHeight:4,width:4,feather:2};
  for(const patch of [{from:[NaN,0]},{toHeight:Infinity},{feather:-1}])assert.throws(()=>compileTerrain({gradeCorridors:[{...corridor,...patch}]}),TypeError);
  for(const patch of [{to:[0,0]},{width:0},{width:Infinity}])assert.throws(()=>compileTerrain({gradeCorridors:[{...corridor,...patch}]}),RangeError);
});
