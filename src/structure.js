import * as THREE from 'three';

// The traced plan controls the bodies, doors and road masks together. Window
// spacing and vertical dimensions are visual details, not room measurements.
export function buildTracedStructure(group,structure,{box,polygon,stairs,materials,unit}){
  const windows=[],local=([x,z])=>[x-group.position.x,z-group.position.z];
  const outline=points=>points.map(local);
  const rectangle=(a,b,base,height,material,depth=.14,offset=.05)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.05)return;
    const mesh=box(group,length,height,depth,(a[0]+b[0])/2+dz/length*offset,base,(a[1]+b[1])/2-dx/length*offset,material);
    mesh.rotation.y=-Math.atan2(dz,dx);
  };
  const edgeWindows=(points,base,height,floors)=>{
    const area=points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=Math.sign(area);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),columns=Math.floor(length/4.5);
      for(let row=0;row<floors;row++)for(let col=0;col<columns;col++){
        const t=(col+.5)/columns;
        windows.push({x:a[0]+dx*t+sign*dz/length*.09,z:a[1]+dz*t-sign*dx/length*.09,y:base+(row+.52)*height/floors,angle:-Math.atan2(dz,dx)});
      }
    }
  };
  const ribbonFacade=(points,base,height,floors,closed=true)=>{
    const sign=closed?Math.sign(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0)):1;
    for(let i=0;i<points.length-(closed?0:1);i++)for(let row=0;row<floors;row++)
      rectangle(points[i],points[(i+1)%points.length],base+row*height/floors+.55,Math.min(2,height/floors-.8),materials.glass,.14,.07*sign);
  };
  const bodies=structure.body?[structure.body]:structure.parts;
  for(const [index,part] of bodies.entries()){
    const points=outline(part.points),{base,height,visualFloors: floors}=part;
    if(part.lowerSolid)polygon(group,points,group.position.y+.8,-group.position.y,materials.wall);
    else if(part.openLowerHeight){
      // Only the rear connecting body uses columns; its lower space stays open.
      for(let i=0;i<points.length;i+=4){const [x,z]=points[i];box(group,.75,part.openLowerHeight+.8,.75,x,-part.openLowerHeight,z,materials.trim);}
    }
    polygon(group,points,height,base,materials.wall);
    if(!part.openLowerHeight&&!part.lowerSolid)polygon(group,points,base,0,materials.foundation);
    // Millimetre-scale separation prevents coplanar overlaps at connecting roofs.
    polygon(group,points,.45,base+height+index*.02,materials.roof);
    for(let floor=1;floor<floors;floor++)polygon(group,points,.15,base+height*floor/floors+index*.02,materials.trim);
    if(part.facade==='ribbon')ribbonFacade(points,base,height,floors);
    else if(part.facade==='entry'){
      for(let i=0;i<points.length;i++){
        rectangle(points[i],points[(i+1)%points.length],base,3.2,materials.glass);
      }
    } else if(part.facade==='blue-upper'){
      for(let i=0;i<points.length;i++)rectangle(points[i],points[(i+1)%points.length],base+height-1.2,1.2,materials.glass,.14,.1);
    } else edgeWindows(points,base,height,floors);
    if(part.role==='tower'){
      // Photo58: the ends facing the main road have two vertical blue strips
      // and upper louvres. Select the eastern edge in the traced campus frame.
      const edges=points.map((a,i)=>[a,points[(i+1)%points.length]]),[a,b]=edges.reduce((p,q)=>p[0][0]+p[1][0]>q[0][0]+q[1][0]?p:q);
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),lerp=t=>a.map((v,j)=>v+(b[j]-v)*t);
      for(const t of [.1,.9])rectangle(lerp(t-.3/length),lerp(t+.3/length),base,height-1,materials.glass,.18,.12);
      for(let row=0;row<4;row++)rectangle(lerp(.2),lerp(.8),base+height-1.2-row*.4,.15,materials.dark,.18,.12);
    }
  }
  if(structure.body)for(const curve of structure.curvedFacades??[])ribbonFacade(outline(curve),structure.body.base,structure.body.height,structure.body.visualFloors,false);
  if(windows.length){
    const mesh=new THREE.InstancedMesh(unit,materials.glass,windows.length),transform=new THREE.Object3D();
    windows.forEach((p,i)=>{transform.position.set(p.x,p.y,p.z);transform.rotation.y=p.angle;transform.scale.set(1.65,1.65,.14);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});group.add(mesh);
  }
  for(const platform of structure.platforms)polygon(group,outline(platform.points),platform.height,platform.base,materials.path);
  for(const entry of structure.entries){
    const [x,z]=local(entry.point),[nx,nz]=entry.normal;
    const points=outline(entry.portalPoints);
    polygon(group,points,group.position.y+entry.base,-group.position.y,materials.foundation);
    polygon(group,points,entry.height,entry.base,materials.trim);
    const door=box(group,entry.width,entry.height,.18,x+nx*.12,entry.base,z+nz*.12,materials.dark);
    door.rotation.y=Math.atan2(nx,nz);
    const canopy=box(group,entry.width+1,.25,1.6,x+nx*.65,entry.base+entry.height,z+nz*.65,materials.trim);
    canopy.rotation.y=door.rotation.y;
  }
  for(const step of structure.steps){
    const g=new THREE.Group(),[x,z]=local(step.point);g.position.set(x,0,z);g.rotation.y=step.rotation;group.add(g);
    stairs(g,step.width,step.height,step.depth,0,0,step.count);
  }
}
