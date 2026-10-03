import test from 'node:test';
import assert from 'node:assert/strict';
import {lonLatToLocal,pixelToLonLat,polygonArea,polygonBounds,overviewExtent,clipSegment,subtractPolygonSegments} from '../src/geo.js';

test('local coordinate frame preserves east and north with metre scale',()=>{
  assert.deepEqual(lonLatToLocal([117.56,26.2],[117.56,26.2]),[0,0]);
  const east=lonLatToLocal([117.561,26.2],[117.56,26.2]);
  const north=lonLatToLocal([117.56,26.201],[117.56,26.2]);
  assert.ok(east[0]>99&&east[0]<101);assert.equal(east[1],0);
  assert.ok(north[1]<-111&&north[1]>-112);
});

test('image registration uses returned extent and top-left pixel origin',()=>{
  const frame={width:100,height:100,extent:{xmin:0,ymin:0,xmax:111319.49079327357,ymax:111325.1428663851,spatialReference:{wkid:3857}}};
  assert.deepEqual(pixelToLonLat([0,100],frame),[0,0]);
  const [lon,lat]=pixelToLonLat([100,0],frame);assert.ok(Math.abs(lon-1)<1e-9&&Math.abs(lat-1)<1e-9);
});

test('whole-campus fit covers the enclosing circle in portrait and landscape',()=>{
  const bounds=polygonBounds([[0,0],[800,0],[800,1250],[0,1250]]);
  assert.equal(polygonArea([[0,0],[800,0],[800,1250],[0,1250]]),1000000);
  const radius=Math.hypot(800,1250)/2;
  for(const aspect of [390/844,1,1280/720]){
    const extent=overviewExtent(bounds,aspect);assert.ok(extent>radius&&extent*aspect>radius);
  }
});

test('regional roads clip at map bounds without changing contained segments',()=>{
  const bounds={minX:0,maxX:10,minZ:0,maxZ:10};
  assert.deepEqual(clipSegment([-20,5],[30,5],bounds),[[0,5],[10,5]]);
  assert.equal(clipSegment([-20,-2],[30,-2],bounds),null);
  assert.deepEqual(clipSegment([2,3],[8,9],bounds),[[2,3],[8,9]]);
});

const square=(left,bottom,right,top)=>[[left,bottom],[right,bottom],[right,top],[left,top]];

test('roads crossing a building retain only the pieces outside its walls',()=>{
  const building=square(2,2,8,8);
  assert.deepEqual(subtractPolygonSegments([0,5],[10,5],[building]),[[[0,5],[2,5]],[[8,5],[10,5]]]);
  assert.deepEqual(subtractPolygonSegments([3,5],[7,5],[building]),[]);
  assert.deepEqual(subtractPolygonSegments([5,5],[10,5],[building]),[[[8,5],[10,5]]]);
  assert.deepEqual(subtractPolygonSegments([10,5],[0,5],[building]),[[[10,5],[8,5]],[[2,5],[0,5]]]);
});

test('roads wholly outside buildings keep their original segment',()=>{
  assert.deepEqual(subtractPolygonSegments([0,0],[10,0],[square(2,2,8,8)]),[[[0,0],[10,0]]]);
  assert.deepEqual(subtractPolygonSegments([0,5],[10,5],[]),[[[0,5],[10,5]]]);
  assert.deepEqual(subtractPolygonSegments([1,1],[1,1],[]),[]);
});

test('a concave footprint preserves a genuine open gap without crossing either wing',()=>{
  const building=[[1,1],[7,1],[7,7],[5,7],[5,3],[3,3],[3,7],[1,7]];
  assert.deepEqual(subtractPolygonSegments([0,5],[8,5],[building]),[[[0,5],[1,5]],[[3,5],[5,5]],[[7,5],[8,5]]]);
});

test('overlapping buildings form a union and never reconnect across hidden intervals',()=>{
  const buildings=[square(2,2,6,8),square(4,2,8,8),square(9,2,11,8)];
  assert.deepEqual(subtractPolygonSegments([0,5],[12,5],buildings),[[[0,5],[2,5]],[[8,5],[9,5]],[[11,5],[12,5]]]);
  assert.deepEqual(subtractPolygonSegments([0,5],[12,5],buildings.toReversed()),[[[0,5],[2,5]],[[8,5],[9,5]],[[11,5],[12,5]]]);
});

test('boundary grazing and vertex tangency remain, but crossing through vertices is removed',()=>{
  const building=square(2,2,8,8);
  assert.deepEqual(subtractPolygonSegments([0,2],[10,2],[building]),[[[0,2],[10,2]]]);
  assert.deepEqual(subtractPolygonSegments([0,4],[4,0],[building]),[[[0,4],[4,0]]]);
  assert.deepEqual(subtractPolygonSegments([0,0],[10,10],[[...building,building[0]]]),[[[0,0],[2,2]],[[8,8],[10,10]]]);
});

test('courtyard holes stay open unless a second building masks them',()=>{
  const courtyard={points:square(2,2,10,10),holes:[square(4,4,8,8)]};
  assert.deepEqual(subtractPolygonSegments([0,6],[12,6],[courtyard]),[[[0,6],[2,6]],[[4,6],[8,6]],[[10,6],[12,6]]]);
  assert.deepEqual(subtractPolygonSegments([0,6],[12,6],[courtyard,square(5,5,9,7)]),[[[0,6],[2,6]],[[4,6],[5,6]],[[10,6],[12,6]]]);
});
