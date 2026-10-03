const R=6378137, radians=Math.PI/180;

export function lonLatToLocal([lon,lat],origin){
  if(![lon,lat,...origin].every(Number.isFinite))throw new TypeError('Invalid geographic coordinate');
  return [(lon-origin[0])*radians*R*Math.cos(origin[1]*radians),(origin[1]-lat)*radians*R];
}

export function pixelToLonLat([x,y],frame){
  const {width,height,extent}=frame;
  if(!width||!height||extent.spatialReference?.wkid!==102100&&extent.spatialReference?.wkid!==3857)throw new TypeError('Expected a Web Mercator image frame');
  const mx=extent.xmin+x/width*(extent.xmax-extent.xmin);
  const my=extent.ymax-y/height*(extent.ymax-extent.ymin);
  return [mx/R/radians,(2*Math.atan(Math.exp(my/R))-Math.PI/2)/radians];
}

export function lonLatToPixel([lon,lat],frame){
  const {width,height,extent}=frame;
  const mx=R*lon*radians,my=R*Math.log(Math.tan(Math.PI/4+lat*radians/2));
  return [(mx-extent.xmin)/(extent.xmax-extent.xmin)*width,(extent.ymax-my)/(extent.ymax-extent.ymin)*height];
}

export function polygonArea(points){
  if(points.length<3)return 0;
  return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
}

export function polygonBounds(points){
  if(!points.length)throw new TypeError('Empty map bounds');
  return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))};
}

export function overviewExtent(bounds,aspect){
  if(!(aspect>0))throw new TypeError('Invalid viewport aspect');
  const radius=Math.hypot(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/2+50;
  return Math.max(radius,radius/aspect)*1.08;
}

// Liang–Barsky clipping keeps long regional OSM ways from inflating campus camera bounds.
export function clipSegment(a,b,bounds){
  const dx=b[0]-a[0],dz=b[1]-a[1];let start=0,end=1;
  const p=[-dx,dx,-dz,dz],q=[a[0]-bounds.minX,bounds.maxX-a[0],a[1]-bounds.minZ,bounds.maxZ-a[1]];
  for(let i=0;i<4;i++){
    if(Math.abs(p[i])<1e-12){if(q[i]<0)return null;continue;}
    const t=q[i]/p[i];if(p[i]<0)start=Math.max(start,t);else end=Math.min(end,t);
    if(start>end)return null;
  }
  return [[a[0]+dx*start,a[1]+dz*start],[a[0]+dx*end,a[1]+dz*end]];
}

// Remove the union of polygon interiors without inventing connections across gaps.
// Accept coordinate rings or {points, holes}; touching a boundary stays outside.
export function subtractPolygonSegments(a,b,polygons){
  const dx=b[0]-a[0],dz=b[1]-a[1],lengthSquared=dx*dx+dz*dz;
  if(!lengthSquared)return [];
  const distanceEpsilon=1e-8,tEpsilon=1e-10,length=Math.sqrt(lengthSquared);
  const masks=polygons.map(p=>Array.isArray(p)?{points:p,holes:[]}:p).filter(p=>p.points.length>=3);
  const cross=(x,z,u,v)=>x*v-z*u;
  const cuts=[0,1];
  for(const mask of masks)for(const ring of [mask.points,...(mask.holes??[])]){
    for(let i=0;i<ring.length;i++){
      const c=ring[i],d=ring[(i+1)%ring.length],ex=d[0]-c[0],ez=d[1]-c[1];
      const edgeLength=Math.hypot(ex,ez);if(!edgeLength)continue;
      const vx=c[0]-a[0],vz=c[1]-a[1],denominator=cross(dx,dz,ex,ez);
      if(Math.abs(denominator)>1e-12*length*edgeLength){
        const t=cross(vx,vz,ex,ez)/denominator,u=cross(vx,vz,dx,dz)/denominator;
        if(t>=-tEpsilon&&t<=1+tEpsilon&&u>=-tEpsilon&&u<=1+tEpsilon)cuts.push(Math.max(0,Math.min(1,t)));
      }else if(Math.abs(cross(vx,vz,dx,dz))<=distanceEpsilon*length){
        // Collinear edges can mark entry to the interior at either endpoint.
        const t0=(vx*dx+vz*dz)/lengthSquared;
        const t1=((d[0]-a[0])*dx+(d[1]-a[1])*dz)/lengthSquared;
        if(Math.max(t0,t1)>=0&&Math.min(t0,t1)<=1)cuts.push(Math.max(0,Math.min(1,t0)),Math.max(0,Math.min(1,t1)));
      }
    }
  }
  cuts.sort((x,y)=>x-y);
  const unique=cuts.filter((t,i)=>!i||t-cuts[i-1]>tEpsilon);
  const pointAt=t=>t===0?[...a]:t===1?[...b]:[a[0]+dx*t,a[1]+dz*t];
  // -1 outside, 0 on the boundary, 1 strictly inside.
  const locate=(p,ring)=>{
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const c=ring[j],d=ring[i],ex=d[0]-c[0],ez=d[1]-c[1],edgeLength=Math.hypot(ex,ez);
      if(!edgeLength)continue;
      const vx=p[0]-c[0],vz=p[1]-c[1],projection=vx*ex+vz*ez;
      if(Math.abs(cross(ex,ez,vx,vz))<=distanceEpsilon*edgeLength&&projection>=-distanceEpsilon*edgeLength&&projection<=edgeLength*edgeLength+distanceEpsilon*edgeLength)return 0;
      if((c[1]>p[1])!==(d[1]>p[1])&&p[0]<(d[0]-c[0])*(p[1]-c[1])/(d[1]-c[1])+c[0])inside=!inside;
    }
    return inside?1:-1;
  };
  const retained=[];
  for(let i=1;i<unique.length;i++){
    const start=unique[i-1],end=unique[i],midpoint=pointAt((start+end)/2);
    const blocked=masks.some(mask=>locate(midpoint,mask.points)===1&&!(mask.holes??[]).some(hole=>locate(midpoint,hole)>=0));
    if(blocked)continue;
    const previous=retained.at(-1);
    if(previous&&Math.abs(previous[1]-start)<=tEpsilon)previous[1]=end;
    else retained.push([start,end]);
  }
  return retained.map(([start,end])=>[pointAt(start),pointAt(end)]);
}
