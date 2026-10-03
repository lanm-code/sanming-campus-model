import {ShapeUtils,Vector2} from 'three';
import {subdivideTriangle} from './surface.js';

const range=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))});
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;

// Narrow steps and ramps need finer geometry than the general campus surface.
// Refinement is shared with validation so checks evaluate the rendered mesh.
export function createTerrainTriangles(boundary,surface){
  const detailed=(surface.gradeCorridors??[]).map(c=>{
    const b=range([c.from,c.to]),margin=c.width/2+c.feather+2;
    return {minX:b.minX-margin,maxX:b.maxX+margin,minZ:b.minZ-margin,maxZ:b.maxZ+margin};
  });
  for(const p of surface.buildingPads??[])if(p.terrainDetail)detailed.push({minX:p.center[0]-p.halfWidth-3,maxX:p.center[0]+p.halfWidth+3,minZ:p.center[1]-p.halfDepth-3,maxZ:p.center[1]+p.halfDepth+3});
  const result=[],contour=boundary.map(([x,z])=>new Vector2(x,z));
  for(const face of ShapeUtils.triangulateShape(contour,[]))for(const coarse of subdivideTriangle(...face.map(i=>boundary[i]),20)){
    const fine=detailed.some(b=>overlaps(range(coarse),b));
    if(!fine)result.push(coarse);
    else for(const medium of subdivideTriangle(...coarse,6))result.push(...(detailed.some(b=>overlaps(range(medium),b))?subdivideTriangle(...medium,1.5):[medium]));
    if(result.length>150000)throw new RangeError('Campus terrain exceeds the mobile display mesh budget');
  }
  return result;
}

// Interpolate the rendered x/y/z faces; outside the campus use the reference
// surface. A spatial index keeps road draping local on large campus meshes.
export function createMeshHeightSampler(positions,fallback,cellSize=20){
  if(!positions||positions.length%9||!Number.isFinite(cellSize)||cellSize<=0||typeof fallback!=='function')throw new TypeError('Invalid terrain mesh sampler');
  const cells=new Map(),key=(x,z)=>x+','+z;
  for(let i=0;i<positions.length;i+=9){
    const xs=[positions[i],positions[i+3],positions[i+6]],zs=[positions[i+2],positions[i+5],positions[i+8]];
    if(!Array.from(positions.slice(i,i+9)).every(Number.isFinite))throw new TypeError('Terrain mesh contains nonfinite coordinates');
    for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++)for(let z=Math.floor(Math.min(...zs)/cellSize);z<=Math.floor(Math.max(...zs)/cellSize);z++){
      const cell=key(x,z);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(i);
    }
  }
  return (x,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('Terrain coordinates must be finite');
    for(const i of cells.get(key(Math.floor(x/cellSize),Math.floor(z/cellSize)))??[]){
      const ax=positions[i],az=positions[i+2],bx=positions[i+3],bz=positions[i+5],cx=positions[i+6],cz=positions[i+8];
      const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(det)<1e-12)continue;
      const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,w=1-u-v;
      if(Math.min(u,v,w)>=-1e-5)return u*positions[i+1]+v*positions[i+4]+w*positions[i+7];
    }
    return fallback(x,z);
  };
}
