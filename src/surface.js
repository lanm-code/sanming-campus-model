// All heights in this module are display-only offsets from the scene datum.
// They are neither surveyed elevations nor physical measurements.
export const SURFACE_HEIGHT_KIND='display-only';

const MAX_TRIANGLES=32768, MAX_DEPTH=64;

function finitePoint(point,label='Point'){
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new TypeError(`${label} must contain two finite coordinates`);
}

function finiteHeight(height){
  if(!Number.isFinite(height))throw new TypeError('Display-only height must be finite');
}

function validFeather(feather){
  if(!Number.isFinite(feather)||feather<0)throw new TypeError('Feather must be finite and nonnegative');
}

function validBounds(bounds){
  if(!bounds||![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite))throw new TypeError('Core bounds must contain finite coordinates');
  if(bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw new RangeError('Core bounds must have positive width and depth');
}

function validRing(ring){
  if(!Array.isArray(ring)||ring.length<3)throw new TypeError('Polygon ring must contain at least three points');
  for(const point of ring)finitePoint(point,'Polygon vertex');
}

function pointInRing([x,z],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,az]=ring[j], [bx,bz]=ring[i];
    const dx=bx-ax,dz=bz-az,px=x-ax,pz=z-az;
    const length=Math.hypot(dx,dz);
    // Only absorb floating-point roundoff at an edge, not a polygon's bounds.
    const tolerance=32*Number.EPSILON*Math.max(1,Math.abs(x),Math.abs(z),Math.abs(ax),Math.abs(az),Math.abs(bx),Math.abs(bz));
    if(!length){if(Math.hypot(px,pz)<=tolerance)return true;continue;}
    const projection=(px*dx+pz*dz)/length;
    const distance=Math.abs(dx*pz-dz*px)/length;
    if(distance<=tolerance&&projection>=-tolerance&&projection<=length+tolerance)return true;
    if((az>z)!==(bz>z)&&x<ax+(bx-ax)*((z-az)/(bz-az)))inside=!inside;
  }
  return inside;
}

/** Test the actual polygon interior; edges and vertices count as inside. */
export function containsPoint(point,ring){
  finitePoint(point);
  validRing(ring);
  return pointInRing(point,ring);
}

function twiceSignedArea(ring){
  if(ring.length<3)return 0;
  const [originX,originZ]=ring[0];let area=0;
  for(let i=1;i<ring.length-1;i++)area+=(ring[i][0]-originX)*(ring[i+1][1]-originZ)-(ring[i][1]-originZ)*(ring[i+1][0]-originX);
  if(!Number.isFinite(area))throw new RangeError('Polygon coordinate range is too large');
  return area;
}

function deduplicateRing(ring,tolerance){
  const result=[];
  const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tolerance;
  for(const point of ring)if(!result.length||!same(point,result.at(-1)))result.push(point);
  if(result.length>1&&same(result[0],result.at(-1)))result.pop();
  return result;
}

function areaTolerance(ring,tolerance){
  let perimeter=0;
  for(let i=0;i<ring.length;i++)perimeter+=edgeLength(ring[i],ring[(i+1)%ring.length]);
  return tolerance*perimeter;
}

/**
 * Clip two convex coordinate rings, accepting either winding. Returns an open
 * coordinate ring with crossing points retained, or [] for zero-area contact.
 */
export function intersectConvexPolygons(subject,clip){
  let scale=1;
  for(const ring of [subject,clip]){
    if(!Array.isArray(ring))throw new TypeError('Convex polygon must be a coordinate ring');
    for(const point of ring){finitePoint(point,'Polygon vertex');scale=Math.max(scale,Math.abs(point[0]),Math.abs(point[1]));}
  }
  const tolerance=64*Number.EPSILON*scale;
  const rings=[subject,clip].map(ring=>deduplicateRing(ring.map(point=>[...point]),tolerance));
  const bounds=rings.map(ring=>{
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const [x,z] of ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
    return {minX,minZ,maxX,maxZ};
  });
  if(rings.some(ring=>ring.length<3)||Math.min(bounds[0].maxX,bounds[1].maxX)-Math.max(bounds[0].minX,bounds[1].minX)<=tolerance||Math.min(bounds[0].maxZ,bounds[1].maxZ)-Math.max(bounds[0].minZ,bounds[1].minZ)<=tolerance)return [];
  const areas=rings.map(twiceSignedArea);
  if(rings.some((ring,i)=>Math.abs(areas[i])<=areaTolerance(ring,tolerance)))return [];
  // Reject a concave ring instead of silently treating its bounding hull as land.
  for(let r=0;r<rings.length;r++){
    const ring=rings[r],orientation=Math.sign(areas[r]);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],c=ring[(i+2)%ring.length];
      const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(orientation*cross < -tolerance*edgeLength(a,b))throw new RangeError('Intersection requires convex polygons');
    }
  }
  let output=rings[0];const clipRing=rings[1],orientation=Math.sign(areas[1]);
  for(let i=0;i<clipRing.length&&output.length;i++){
    const a=clipRing[i],b=clipRing[(i+1)%clipRing.length],dx=b[0]-a[0],dz=b[1]-a[1],length=edgeLength(a,b);
    if(!length)continue;
    const side=point=>orientation*(dx*(point[1]-a[1])-dz*(point[0]-a[0]))/length;
    const input=output;output=[];
    let previous=input.at(-1),previousSide=side(previous),previousInside=previousSide>=-tolerance;
    for(const current of input){
      const currentSide=side(current),currentInside=currentSide>=-tolerance;
      if(currentInside!==previousInside){
        const t=Math.max(0,Math.min(1,previousSide/(previousSide-currentSide)));
        output.push([previous[0]*(1-t)+current[0]*t,previous[1]*(1-t)+current[1]*t]);
      }
      if(currentInside)output.push(current);
      previous=current;previousSide=currentSide;previousInside=currentInside;
    }
    output=deduplicateRing(output,tolerance);
  }
  if(output.length<3||Math.abs(twiceSignedArea(output))<=areaTolerance(output,tolerance))return [];
  return output;
}

function rectWeight(x,z,bounds,feather){
  const dx=Math.max(bounds.minX-x,0,x-bounds.maxX);
  const dz=Math.max(bounds.minZ-z,0,z-bounds.maxZ);
  const distance=Math.hypot(dx,dz);
  if(!distance)return 1;
  return featherWeight(distance,feather);
}

function featherWeight(distance,feather){
  if(distance<=0)return 1;
  if(!feather||distance>=feather)return 0;
  const t=distance/feather;
  return 1-t*t*(3-2*t);
}

function collection(surface,key){
  const entries=surface[key]??[];
  if(!Array.isArray(entries))throw new TypeError(`${key} must be an array`);
  return entries;
}

function prepareSurface(surface,copy){
  if(!surface||typeof surface!=='object'||Array.isArray(surface))throw new TypeError('Surface must be an object');
  const terraces=collection(surface,'terraces').map(terrace=>{
    if(!terrace||typeof terrace!=='object')throw new TypeError('Terrace must be an object');
    const {coreBounds,height:displayHeight,feather=0}=terrace;
    validBounds(coreBounds);finiteHeight(displayHeight);validFeather(feather);
    return {coreBounds:copy?{...coreBounds}:coreBounds,height:displayHeight,feather};
  });
  const levelAreas=collection(surface,'levelAreas').map(area=>{
    if(!area||typeof area!=='object')throw new TypeError('Level area must be an object');
    validRing(area.points);finiteHeight(area.height);
    return {points:copy?area.points.map(point=>[...point]):area.points,height:area.height};
  });
  const buildingPads=collection(surface,'buildingPads').map(pad=>{
    if(!pad||typeof pad!=='object')throw new TypeError('Building pad must be an object');
    const {center,halfWidth,halfDepth,height:displayHeight,feather=0}=pad;
    finitePoint(center,'Pad center');finiteHeight(displayHeight);validFeather(feather);
    if(!Number.isFinite(halfWidth)||!Number.isFinite(halfDepth)||halfWidth<=0||halfDepth<=0)throw new RangeError('Pad half dimensions must be finite and positive');
    const coreBounds={minX:center[0]-halfWidth,maxX:center[0]+halfWidth,minZ:center[1]-halfDepth,maxZ:center[1]+halfDepth};
    validBounds(coreBounds);
    return {coreBounds,height:displayHeight,feather};
  });
  const gradeCorridors=collection(surface,'gradeCorridors').map(corridor=>{
    if(!corridor||typeof corridor!=='object')throw new TypeError('Grade corridor must be an object');
    const {from,to,fromHeight,toHeight,width,feather=0}=corridor;
    finitePoint(from,'Corridor start');finitePoint(to,'Corridor end');finiteHeight(fromHeight);finiteHeight(toHeight);validFeather(feather);
    if(!Number.isFinite(width)||width<=0)throw new RangeError('Corridor width must be finite and positive');
    const length=edgeLength(from,to);
    if(!length)throw new RangeError('Grade corridor must have distinct endpoints');
    return {from:copy?[...from]:from,fromHeight,toHeight,halfWidth:width/2,feather,length,unitX:(to[0]-from[0])/length,unitZ:(to[1]-from[1])/length};
  });
  return {terraces,levelAreas,buildingPads,gradeCorridors};
}

function samplePreparedTerrain(x,z,surface){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('Terrain coordinates must be finite');
  let height;
  for(const {coreBounds,height:displayHeight,feather} of surface.terraces){
    const weight=rectWeight(x,z,coreBounds,feather);
    if(weight>0){
      const candidate=displayHeight*weight;
      height=height===undefined?candidate:Math.max(height,candidate);
    }
  }
  height??=0;
  let levelHeight;
  for(const area of surface.levelAreas){
    if(pointInRing([x,z],area.points))levelHeight=levelHeight===undefined?area.height:Math.max(levelHeight,area.height);
  }
  height=levelHeight??height;
  let padHeight,padCoreHeight;
  for(const {coreBounds,height:displayHeight,feather} of surface.buildingPads){
    const weight=rectWeight(x,z,coreBounds,feather);
    if(weight===1)padCoreHeight=padCoreHeight===undefined?displayHeight:Math.max(padCoreHeight,displayHeight);
    if(weight>0){
      const candidate=height*(1-weight)+displayHeight*weight;
      padHeight=padHeight===undefined?candidate:Math.max(padHeight,candidate);
    }
  }
  height=padCoreHeight??padHeight??height;
  let corridorHeight,corridorCoreHeight;
  for(const corridor of surface.gradeCorridors){
    const {from,fromHeight,toHeight,halfWidth,feather,length,unitX,unitZ}=corridor;
    const dx=x-from[0],dz=z-from[1],along=dx*unitX+dz*unitZ;
    const side=Math.abs(dx*unitZ-dz*unitX),beyond=Math.max(-along,along-length,0);
    // Flat caps: no full-height extension past an endpoint, only feathering.
    const weight=featherWeight(side-halfWidth,feather)*featherWeight(beyond,feather);
    if(weight>0){
      const t=Math.max(0,Math.min(1,along/length));
      const target=fromHeight*(1-t)+toHeight*t;
      if(weight===1)corridorCoreHeight=corridorCoreHeight===undefined?target:Math.max(corridorCoreHeight,target);
      const candidate=height*(1-weight)+target*weight;
      corridorHeight=corridorHeight===undefined?candidate:Math.max(corridorHeight,candidate);
    }
  }
  return corridorCoreHeight??corridorHeight??height;
}

/**
 * Return one display-only height scalar. Unknown terrain returns the scene
 * datum (0), which does not assert a measured elevation or a flat site.
 * Precedence: terraces, level areas, building pads, then grade corridors.
 * Final corridors can lower existing terrain to expose a declared staircase.
 */
export function sampleTerrain(x,z,surface={}){
  return samplePreparedTerrain(x,z,prepareSurface(surface,false));
}

/** Validate and snapshot a fixed display surface once for mesh vertex sampling. */
export function compileTerrain(surface={}){
  const prepared=prepareSurface(surface,true);
  const sampler=(x,z)=>samplePreparedTerrain(x,z,prepared);
  sampler.heightKind=SURFACE_HEIGHT_KIND;
  return sampler;
}

function edgeLength(a,b){
  const length=Math.hypot(a[0]-b[0],a[1]-b[1]);
  if(!Number.isFinite(length))throw new RangeError('Triangle coordinate range is too large');
  return length;
}

/** Bisect only the longest edge until every triangle edge is <= maxEdge. */
export function subdivideTriangle(a,b,c,maxEdge=18){
  for(const point of [a,b,c])finitePoint(point,'Triangle vertex');
  if(!Number.isFinite(maxEdge)||maxEdge<=0)throw new RangeError('Maximum edge must be finite and positive');
  const pending=[{points:[[...a],[...b],[...c]],depth:0}], triangles=[];
  while(pending.length){
    const {points,depth}=pending.pop();
    const lengths=points.map((point,i)=>edgeLength(point,points[(i+1)%3]));
    const longest=Math.max(...lengths), index=lengths.indexOf(longest);
    if(longest<=maxEdge){triangles.push(points);continue;}
    if(depth>=MAX_DEPTH||triangles.length+pending.length+2>MAX_TRIANGLES||longest/maxEdge>MAX_TRIANGLES)throw new RangeError('Triangle subdivision exceeds the display mesh budget');
    const start=points[index],end=points[(index+1)%3],other=points[(index+2)%3];
    const midpoint=[start[0]/2+end[0]/2,start[1]/2+end[1]/2];
    if(midpoint.every((value,i)=>value===start[i])||midpoint.every((value,i)=>value===end[i]))throw new RangeError('Maximum edge is below coordinate precision');
    // Each split preserves winding and replaces one triangle with exactly two.
    pending.push({points:[midpoint,end,other],depth:depth+1},{points:[start,midpoint,other],depth:depth+1});
  }
  return triangles;
}
