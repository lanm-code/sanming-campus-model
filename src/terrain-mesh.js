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
