import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { isTap } from './state.js';
import { campusBase } from './data.js';
import { overviewExtent } from './geo.js';
import { compileTerrain,intersectConvexPolygons } from './surface.js';
import {createTerrainTriangles,createMeshHeightSampler} from './terrain-mesh.js';

export function createCampusMap(container, buildings, onSelect, onError) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
  } catch {
    onError('当前设备未能开启立体地图，可继续用左侧地点与楼层清单查找。');
    return {select(){}, focus(){}, reset(){}, fit(){}, north(){}, rotate(){}, zoom(){}, top(){}, resize(){}};
  }
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '校园立体地图；使用旁边的地点列表也可选择建筑');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.dataset.renderer = 'ready';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xeaf0e9, 1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const bounds=campusBase.bounds;
  const center=new THREE.Vector3((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
  const radius=Math.hypot(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/2;
  const camera = new THREE.OrthographicCamera(-800,800,800,-800,1,8000);
  const portrait=container.clientWidth/container.clientHeight<.9;
  camera.position.copy(center).add(portrait?new THREE.Vector3(0,radius*2.8,radius*1.3):new THREE.Vector3(radius*.45,radius*1.5,radius*1.8));
  const controls = new OrbitControls(camera,renderer.domElement);
  let needsRender=true;
  controls.addEventListener('change',()=>{needsRender=true;});
  document.addEventListener('visibilitychange',()=>{needsRender=true;});
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.screenSpacePanning = false;
  controls.minZoom=.7; controls.maxZoom=26;
  controls.minPolarAngle=Math.PI/7; controls.maxPolarAngle=Math.PI*.39;
  controls.mouseButtons = {LEFT:THREE.MOUSE.ROTATE, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.PAN};
  controls.touches = {ONE:THREE.TOUCH.ROTATE, TWO:THREE.TOUCH.DOLLY_PAN};
  controls.update(); controls.saveState();
  scene.add(new THREE.HemisphereLight(0xffffff,0x78866f,1.5));
  const sun=new THREE.DirectionalLight(0xfff5df,2.2);
  sun.position.copy(center).add(new THREE.Vector3(-600,1000,700));sun.target.position.copy(center);scene.add(sun.target);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-1200,right:1200,top:1200,bottom:-1200,near:1,far:3500});
  sun.shadow.bias=-.002;
  sun.shadow.normalBias=.6;
  scene.add(sun);
  const materials={
    wall:new THREE.MeshStandardMaterial({color:0xe8e0c9,roughness:.86}),
    trim:new THREE.MeshStandardMaterial({color:0xf4efe4,roughness:.83}),
    glass:new THREE.MeshStandardMaterial({color:0x608f9a,roughness:.36,metalness:.1}),
    roof:new THREE.MeshStandardMaterial({color:0x9c9e8e,roughness:.9}),
    foundation:new THREE.MeshStandardMaterial({color:0xd9d8c8,roughness:.95}),
    path:new THREE.MeshStandardMaterial({color:0xe8e3d3,roughness:1}),
    grass:new THREE.MeshStandardMaterial({color:0xadc49a,roughness:1}),
    tree:new THREE.MeshStandardMaterial({color:0x7da274,roughness:1}),
    trunk:new THREE.MeshStandardMaterial({color:0xa38f6b,roughness:1}),
    dark:new THREE.MeshStandardMaterial({color:0x37545a,roughness:.5}),
    contextWall:new THREE.MeshStandardMaterial({color:0xb9c5c7,roughness:1}),
    contextRoof:new THREE.MeshStandardMaterial({color:0xa1afb1,roughness:1}),
    earth:new THREE.MeshStandardMaterial({color:0xb09b7d,roughness:1})
  };
  const stone=new THREE.MeshStandardMaterial({color:0xb69a87,roughness:.9});
  const unit = new THREE.BoxGeometry(1,1,1);
  const bodyGroups=new Map(), pickable=[];
  function box(group,w,h,d,x,y,z,material) {
    const m=new THREE.Mesh(unit,material);
    m.scale.set(w,h,d);m.position.set(x,y+h/2,z);
    m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
  }
  function block(group,w,h,d,x,y,z,floors,columns) {
    box(group,w,h,d,x,y,z,materials.wall);
    box(group,w+.7,.65,d+.7,x,y+h,z,materials.roof);
    for(let f=1;f<floors;f++) box(group,w+.12,.15,d+.12,x,y+h*f/floors,z,materials.trim);
    const positions=[];
    for(let f=0;f<floors;f++) for(let c=0;c<columns;c++){
      const dx=x-w/2+(c+.5)*w/columns;
      const yy=y+(f+.52)*h/floors;
      positions.push([dx,yy,z+d/2+.04,1.2,1.55,.12],[dx,yy,z-d/2-.04,1.2,1.55,.12]);
    }
    for(let f=0;f<floors;f++) for(let c=0;c<Math.max(2,Math.round(d/4));c++){
      const dz=z-d/2+(c+.5)*d/Math.max(2,Math.round(d/4));
      positions.push([x-w/2-.04,y+(f+.52)*h/floors,dz,.12,1.55,1.2],
        [x+w/2+.04,y+(f+.52)*h/floors,dz,.12,1.55,1.2]);
    }
    const windows=new THREE.InstancedMesh(unit,materials.glass,positions.length);
    const transform=new THREE.Object3D();
    positions.forEach((p,i)=>{transform.position.set(p[0],p[1],p[2]);transform.scale.set(p[3],p[4],p[5]);transform.updateMatrix();windows.setMatrixAt(i,transform.matrix);});
    group.add(windows);
  }
  function stairs(group,width,height,depth,x,z,steps=8) {
    for(let i=0;i<steps;i++) box(group,width,height*(i+1)/steps,depth/steps,x,0,z+depth/2-(i+.5)*depth/steps,materials.path);
  }
  // Shape coordinates describe a curved footprint; dimensions remain display parameters.
  function curvedVolume(group,width,depth,height,base,front,sag,material) {
    const shape=new THREE.Shape(), segments=24;
    const edge=(x)=>front+sag*(1-(x/(width/2))**2);
    shape.moveTo(-width/2,-edge(-width/2));
    for(let i=1;i<=segments;i++){const x=-width/2+width*i/segments;shape.lineTo(x,-edge(x));}
    for(let i=segments;i>=0;i--){const x=-width/2+width*i/segments;shape.lineTo(x,-edge(x)+depth);}
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:segments});
    geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.y=base;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    return edge;
  }
  function polygon(group,points,height,base,material,holes=[]){
    const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
    for(const ring of holes)shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.y=base;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  const landscape=new THREE.Group();scene.add(landscape);
  const heightCache=new Map(),boundary=campusBase.campusBoundary,surface=campusBase.surface;
  const sampleHeight=compileTerrain(surface);
  const heightAt=(x,z)=>{const key=x.toFixed(3)+','+z.toFixed(3);if(!heightCache.has(key))heightCache.set(key,sampleHeight(x,z));return heightCache.get(key);};
  const palette={green:0x9fbc87,plaza:0xe5d9ba,teaching:0xd9c89a,living:0xb7d0dc,sports:0x91b7a4};
  const colours=Object.fromEntries(Object.entries(palette).map(([key,value])=>[key,new THREE.Color(value)]));
  const vertices=[],groundColours=[],groundNormals=[],parcelVertices=[],parcelColours=[],parcelNormals=[];
  const range=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))});
  const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
  const parcelFaces=surface.parcels.flatMap(p=>THREE.ShapeUtils.triangulateShape(p.points.map(([x,z])=>new THREE.Vector2(x,z)),[]).map(face=>{const points=face.map(i=>p.points[i]);return {points,bounds:range(points),colour:colours[p.type]??colours.green};}));
  const normalCache=new Map();
  const normalAt=(x,z)=>{const key=x.toFixed(3)+','+z.toFixed(3);if(!normalCache.has(key)){const n=new THREE.Vector3(heightAt(x-.5,z)-heightAt(x+.5,z),1,heightAt(x,z-.5)-heightAt(x,z+.5)).normalize();normalCache.set(key,[n.x,n.y,n.z]);}return normalCache.get(key);};
  const winding=tri=>(tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0]);
  const addFace=(triangle,colour,positions,colors,normals,elevation)=>{for(const [x,z] of winding(triangle)>0?[triangle[0],triangle[2],triangle[1]]:triangle){positions.push(x,elevation(x,z),z);colors.push(colour.r,colour.g,colour.b);normals.push(...normalAt(x,z));}};
  for(const triangle of createTerrainTriangles(boundary,surface)){
      addFace(triangle,colours.green,vertices,groundColours,groundNormals,heightAt);
      const heights=triangle.map(p=>heightAt(...p)),denominator=winding(triangle),tb=range(triangle);
      // Colour polygons follow the very same triangle plane, avoiding both jagged
      // land-use outlines and depth flicker between independently sampled meshes.
      const planeHeight=(x,z)=>{const [a,b,c]=triangle,u=((b[0]-x)*(c[1]-z)-(b[1]-z)*(c[0]-x))/denominator,v=((c[0]-x)*(a[1]-z)-(c[1]-z)*(a[0]-x))/denominator;return heights[0]*u+heights[1]*v+heights[2]*(1-u-v)+.06;};
      for(const parcel of parcelFaces){
        if(!overlaps(tb,parcel.bounds))continue;
        const clipped=intersectConvexPolygons(triangle,parcel.points);
        for(let i=1;i<clipped.length-1;i++)addFace([clipped[0],clipped[i],clipped[i+1]],parcel.colour,parcelVertices,parcelColours,parcelNormals,planeHeight);
      }
  }
  renderer.domElement.dataset.terrainTriangles=String(vertices.length/9);
  const groundGeometry=new THREE.BufferGeometry();groundGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));groundGeometry.setAttribute('color',new THREE.Float32BufferAttribute(groundColours,3));groundGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(groundNormals,3));
  const ground=new THREE.Mesh(groundGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;landscape.add(ground);
  const meshHeight=createMeshHeightSampler(groundGeometry.attributes.position.array,heightAt);
  const parcelGeometry=new THREE.BufferGeometry();parcelGeometry.setAttribute('position',new THREE.Float32BufferAttribute(parcelVertices,3));parcelGeometry.setAttribute('color',new THREE.Float32BufferAttribute(parcelColours,3));parcelGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(parcelNormals,3));
  const parcels=new THREE.Mesh(parcelGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));parcels.receiveShadow=true;landscape.add(parcels);
  polygon(landscape,boundary,1,-4,materials.earth);
  const skirts=[];
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12);
    for(let j=0;j<count;j++){
      const p=[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count],q=[a[0]+(b[0]-a[0])*(j+1)/count,a[1]+(b[1]-a[1])*(j+1)/count];
      const topP=[p[0],heightAt(...p),p[1]],topQ=[q[0],heightAt(...q),q[1]],lowP=[p[0],-3,p[1]],lowQ=[q[0],-3,q[1]];
      skirts.push(...topP,...lowP,...topQ,...topQ,...lowP,...lowQ);
    }
  }
  const skirtGeometry=new THREE.BufferGeometry();skirtGeometry.setAttribute('position',new THREE.Float32BufferAttribute(skirts,3));skirtGeometry.computeVertexNormals();
  landscape.add(new THREE.Mesh(skirtGeometry,new THREE.MeshStandardMaterial({color:0xb59c7d,roughness:1,side:THREE.DoubleSide})));
  const ribbonBatches=new Map();
  const boundaryMaterial=new THREE.MeshBasicMaterial({color:0x367bb5,side:THREE.DoubleSide,toneMapped:false});
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let offset=0;offset<length;offset+=13){const end=Math.min(offset+8,length),p=[a[0]+(b[0]-a[0])*offset/length,a[1]+(b[1]-a[1])*offset/length],q=[a[0]+(b[0]-a[0])*end/length,a[1]+(b[1]-a[1])*end/length];ribbon(p,q,2,boundaryMaterial,(x,z)=>heightAt(x,z)+.32);}
  }
  function ribbon(a,b,width,material,elevation=(x,z)=>meshHeight(x,z)+.22){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)return;
    const nx=-dz/length*width/2,nz=dx/length*width/2,count=Math.ceil(length/1.5),positions=[];
    for(let i=0;i<count;i++){
      const points=[i/count,(i+1)/count].flatMap(t=>[[-1,t],[1,t]].map(([side,t])=>{const x=a[0]+dx*t+nx*side,z=a[1]+dz*t+nz*side;return [x,elevation(x,z,t),z];}));
      for(const index of [0,1,2,2,1,3])positions.push(...points[index]);
    }
    if(!ribbonBatches.has(material))ribbonBatches.set(material,[]);
    ribbonBatches.get(material).push(...positions);
  }
  const roadMaterial=new THREE.MeshStandardMaterial({color:0x77888e,roughness:1,side:THREE.DoubleSide});
  const regionalMaterial=new THREE.MeshStandardMaterial({color:0x9a9c9b,roughness:1,side:THREE.DoubleSide});
  for(const road of campusBase.roads){
    const regional=['trunk','trunk_link','secondary','unclassified'].includes(road.type),width=regional?8:5;
    for(const [a,b] of road.segments){
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;
      ribbon(a,b,width,regional?regionalMaterial:roadMaterial);
    }
  }
  const stepMaterial=new THREE.MeshStandardMaterial({color:0xc8ccc8,roughness:1});
  for(const ramp of surface.ramps)ribbon(ramp.from,ramp.to,ramp.width,stepMaterial,(x,z,t)=>ramp.fromHeight+(ramp.toHeight-ramp.fromHeight)*t+.25);
  for(const stair of surface.stairs){
    const [a,b]=[stair.from,stair.to],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    for(let i=0;i<stair.steps;i++){
      const t=(i+.5)/stair.steps,x=a[0]+dx*t,z=a[1]+dz*t;
      const top=stair.fromHeight+(stair.toHeight-stair.fromHeight)*(stair.toHeight>stair.fromHeight?(i+1)/stair.steps:i/stair.steps)+.18;
      const base=Math.min(heightAt(x,z),stair.fromHeight,stair.toHeight)-.25;
      const step=box(landscape,stair.width,top-base,length/stair.steps+.02,x,base,z,stepMaterial);step.rotation.y=Math.atan2(dx,dz);
    }
  }
  for(const bridge of surface.bridges){
    ribbon(bridge.from,bridge.to,bridge.width,roadMaterial,(x,z,t)=>bridge.fromHeight+(bridge.toHeight-bridge.fromHeight)*t+.25);
    const dx=bridge.to[0]-bridge.from[0],dz=bridge.to[1]-bridge.from[1],length=Math.hypot(dx,dz),nx=-dz/length*bridge.width/2,nz=dx/length*bridge.width/2;
    for(const t of [.15,.85]){
      const x=bridge.from[0]+dx*t,z=bridge.from[1]+dz*t,deck=bridge.fromHeight+(bridge.toHeight-bridge.fromHeight)*t+.25;
      const base=Math.min(heightAt(x,z),bridge.lowerSurfaceHeight),height=deck-base;
      for(const side of [-.65,.65])box(landscape,.8,height,.8,x+nx*side,base,z+nz*side,materials.trim);
    }
    for(const side of [-1,1]){
      const points=[0,1].map(t=>new THREE.Vector3(bridge.from[0]+dx*t+nx*side,bridge.fromHeight+(bridge.toHeight-bridge.fromHeight)*t+1,bridge.from[1]+dz*t+nz*side));
      landscape.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xe1e5e0})));
    }
  }
  for(const [material,positions] of ribbonBatches){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;landscape.add(mesh);
  }
  const pitchMaterial=new THREE.MeshStandardMaterial({color:0x86ad88,roughness:1});
  const courtMaterial=new THREE.MeshStandardMaterial({color:0xbf9585,roughness:1});
  const trackMaterial=new THREE.MeshStandardMaterial({color:0xb97866,roughness:1});
  for(const area of campusBase.sportsAreas??[]){
    const center=area.points.reduce((p,q)=>[p[0]+q[0]/area.points.length,p[1]+q[1]/area.points.length],[0,0]);
    polygon(landscape,area.points,.08,heightAt(...center)+.14,area.scopeStatus==='outside-reference'?materials.contextWall:area.type==='basketball'||area.type==='track'?trackMaterial:pitchMaterial);
  }
  for(const field of campusBase.sports){
    const center=field.points.reduce((p,q)=>[p[0]+q[0]/field.points.length,p[1]+q[1]/field.points.length],[0,0]),height=heightAt(...center);
    polygon(landscape,field.points,.12,height+.22,field.type==='basketball'?courtMaterial:pitchMaterial);
    const linePoints=[...field.points,field.points[0]].map(([x,z])=>new THREE.Vector3(x,height+.38,z));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints),new THREE.LineBasicMaterial({color:0xf4f2e6})));
  }
  const labels=document.createElement('div');labels.className='map-labels';container.append(labels);
  const projected=[];
  for(const field of campusBase.sports.filter(f=>f.type==='soccer')){
    const c=field.points.reduce((p,q)=>[p[0]+q[0]/field.points.length,p[1]+q[1]/field.points.length],[0,0]);
    const label=document.createElement('span');label.className='map-label field-label';label.textContent=field.name;labels.append(label);
    projected.push({label,id:'field-'+field.id,context:false,position:new THREE.Vector3(c[0],heightAt(...c)+2,c[1])});
  }
  for(const b of buildings.filter(b=>b.model)){
    const g=new THREE.Group();g.position.fromArray(b.position);g.userData.buildingId=b.id;
    g.rotation.y=b.rotation??0;if(b.modelScale)g.scale.fromArray(b.modelScale);
    if(b.model==='footprint'){
      const outside=b.scopeStatus==='outside-reference'||b.scopeStatus==='crosses-reference';
      polygon(g,b.footprint,b.visualHeight,0,outside?materials.contextWall:materials.wall,b.holes);
      polygon(g,b.footprint,.5,b.visualHeight,outside?materials.contextRoof:materials.roof,b.holes);
    } else if(b.model==='library'){
      // Rear photos36/127 show an open lower level; the front terrace conceals it.
      for(const x of [-17,-8,0,8,17])for(const z of [-10,5])box(g,.85,3.5,.85,x,-3.5,z,materials.trim);
      box(g,42,.8,32,0,0,0,materials.foundation);
      block(g,11,17,22,-13,.8,-2,5,3);
      block(g,11,26,22,13,.8,-2,8,3);
      block(g,19,7,11,0,.8,-9,2,5);
      const entry=new THREE.Mesh(new THREE.CylinderGeometry(14,14,6,32,1,false,-Math.PI/2,Math.PI),materials.trim);
      entry.position.set(0,3.8,8);entry.scale.z=.54;entry.castShadow=true;g.add(entry);
      box(g,20,4,.5,0,.8,12,materials.glass);
      box(g,18,.7,4,0,6.8,10,materials.trim);
      stairs(g,24,.8,4,0,17,4);
      box(g,.65,17,1,-18,.8,9,materials.glass);
      box(g,.65,26,1,18,.8,9,materials.glass);
      // Photo58: blue vertical strips and upper louvres on the unequal front wings.
      for(const [x,h] of [[-13,17],[13,26]]){
        for(const dx of [-4.6,4.6])box(g,.55,h-1,.22,x+dx,.8,9.12,materials.glass);
        for(let row=0;row<4;row++)box(g,7,.2,.25,x,.8+h-1.1-row*.45,9.2,materials.dark);
      }
      curvedVolume(g,23,2,.7,6.8,12,1.8,materials.trim);
    } else if(b.model==='boxue'){
      // Photos66/71 show three transverse wings joined by one spine, with two court gaps.
      box(g,47,1.2,51,0,0,0,materials.foundation);
      for(const z of [-20,0,20])block(g,37,20,7,-3,1.2,z,6,12);
      block(g,7,20,47,18,1.2,0,6,3);
      const corner=new THREE.Group();corner.position.set(15,0,20);g.add(corner);
      curvedVolume(corner,12,5,20,1.2,4,2.4,materials.wall);
      for(let floor=0;floor<6;floor++){
        curvedVolume(corner,11.7,.16,2.1,1.2+floor*20/6+.6,4.18,2.4,materials.glass);
        curvedVolume(corner,12.2,.35,.45,1.2+(floor+1)*20/6-.45,4.26,2.4,materials.trim);
      }
      curvedVolume(corner,12.8,5.8,.65,21.2,4.4,2.4,materials.roof);
      const entrance2F=1.2+20/6;
      box(g,9,20/6,5,15,1.2,28,materials.path);
      box(g,7,3.2,.25,15,entrance2F,26.2,materials.dark);
      stairs(g,9,entrance2F,11,15,35,10);
      box(g,5,3.1,.25,-18,1.2,-23.65,materials.dark);
    } else {
      // Photos97/98: shallow curved frontage, broad central glazing and stone lower floors.
      box(g,47,1,34,0,0,0,materials.foundation);
      const edge=curvedVolume(g,42,11,28,1,5,3.8,materials.wall);
      curvedVolume(g,42.2,11.2,6,1,5.1,3.8,stone);
      curvedVolume(g,42.8,11.8,.65,29,5.25,3.8,materials.roof);
      for(let floor=0;floor<9;floor++)for(let col=0;col<13;col++){
        const x=-21+(col+.5)*42/13;
        if(Math.abs(x)<6.2)continue;
        const window=box(g,1.45,1.65,.2,x,1+(floor+.25)*28/9,edge(x)+.16,materials.glass);
        window.rotation.y=Math.atan(2*3.8*x/(21*21));
      }
      curvedVolume(g,11.5,.22,21,7,8.75,.3,materials.glass);
      box(g,17,.9,7,0,5.5,11,stone);
      for(const x of [-6.5,6.5])box(g,1,4.5,1,x,1,13,stone);
      box(g,8,3.5,.25,0,1,9.1,materials.dark);
      stairs(g,19,1,6,0,18,5);
      // Photo95 supports a separate low annex connected above an open passage.
      block(g,20,10,16,-8,1,-25,3,6);
      box(g,3,1.4,10,-8,4.5,-13,materials.trim);
    }
    g.traverse(m=>{if(m.isMesh){pickable.push(m);}});
    scene.add(g);bodyGroups.set(b.id,g);
    const label=document.createElement('button');
    label.className='map-label';label.type='button';label.textContent=b.name;
    label.dataset.building=b.id;label.setAttribute('aria-label','查看'+b.name);
    label.addEventListener('click',()=>onSelect(b.id));labels.append(label);
    projected.push({label,id:b.id,context:b.model==='footprint',position:new THREE.Vector3(b.position[0],b.labelHeight,b.position[2])});
  }
  let outline=null;
  // Geometry owns its typed buffers; these build-time caches can be released.
  normalCache.clear();heightCache.clear();
  const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
  const pointers=new Set();let gesture=null;
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{
    pointers.add(e.pointerId);
    if(pointers.size===1)gesture={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),maxDistance:0,multi:false,cancelled:false};
    if(pointers.size>1&&gesture)gesture.multi=true;
  });
  canvas.addEventListener('pointermove',e=>{
    if(gesture&&gesture.id===e.pointerId)gesture.maxDistance=Math.max(gesture.maxDistance,Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y));
  });
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);if(gesture)gesture.cancelled=true;});
  canvas.addEventListener('pointerup',e=>{
    if(e.button===0 && isTap(gesture,e.pointerId,e.clientX,e.clientY,performance.now())){
      const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(mouse,camera);
      const hit=raycaster.intersectObjects(pickable,false)[0];
      if(hit){let g=hit.object;while(g&&!g.userData.buildingId)g=g.parent;if(g)onSelect(g.userData.buildingId);}
    }
    pointers.delete(e.pointerId);if(!pointers.size)gesture=null;
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onError('立体地图暂时中断，请刷新重试；地点与楼层清单仍可使用。');});
  function resize(){
    const {width,height}=container.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height, extent=overviewExtent(bounds,aspect);
    camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;
    camera.updateProjectionMatrix();renderer.setSize(width,height);
    needsRender=true;
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  let obliqueOffset=camera.position.clone().sub(controls.target);
  function fitBox(box,padding=1.2){
    camera.updateMatrixWorld();
    let halfX=0,halfY=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
      halfX=Math.max(halfX,Math.abs(p.x));halfY=Math.max(halfY,Math.abs(p.y));
    }
    camera.zoom=THREE.MathUtils.clamp(Math.min(camera.right/(halfX*padding||1),camera.top/(halfY*padding||1)),controls.minZoom,controls.maxZoom);
    camera.updateProjectionMatrix();
    needsRender=true;
  }
  function fitCampus(){
    const offset=camera.position.clone().sub(controls.target);controls.target.copy(center);camera.position.copy(center).add(offset);controls.update();
    fitBox(new THREE.Box3(new THREE.Vector3(bounds.minX,-4,bounds.minZ),new THREE.Vector3(bounds.maxX,50,bounds.maxZ)));
  }
  fitCampus();controls.saveState();
  function animate(){
    requestAnimationFrame(animate);if(document.hidden)return;
    controls.update();
    const clamped=controls.target.clone();clamped.x=THREE.MathUtils.clamp(clamped.x,bounds.minX-30,bounds.maxX+30);clamped.z=THREE.MathUtils.clamp(clamped.z,bounds.minZ-30,bounds.maxZ+30);
    const correction=clamped.clone().sub(controls.target);
    camera.position.add(correction);controls.target.copy(clamped);
    if(correction.lengthSq())needsRender=true;
    if(!needsRender)return;needsRender=false;
    renderer.render(scene,camera);
    const width=container.clientWidth,height=container.clientHeight, placed=[];
    // Main landmarks and the selected building have priority over dense context labels.
    [...projected].sort((a,b)=>Number(b.label.classList.contains('selected'))-Number(a.label.classList.contains('selected'))||Number(a.context)-Number(b.context)||Number(a.id.startsWith('field-'))-Number(b.id.startsWith('field-'))).forEach(p=>{
      const v=p.position.clone().project(camera), x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;
      const overlaps=placed.some(a=>Math.abs(a.x-x)<125 && Math.abs(a.y-y)<35);
      const selected=p.label.classList.contains('selected');
      const visible=v.z>=-1&&v.z<=1&&x>24&&x<width-24&&y>26&&y<height-26&&(!overlaps||selected)&&(!p.context||camera.zoom>=2.5||selected);
      p.label.hidden=!visible;
      if(visible){p.label.style.transform='translate(-50%,-100%) translate('+x+'px,'+y+'px)';placed.push({x,y});}
    });
    canvas.dataset.angle=String(Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())));
    canvas.dataset.zoom=camera.zoom.toFixed(2);
    canvas.dataset.sceneBuildings=String(bodyGroups.size);
    const scale=document.getElementById('map-scale');
    if(scale){
      const metresPerPixel=(camera.right-camera.left)/camera.zoom/width;
      const raw=80*metresPerPixel,base=10**Math.floor(Math.log10(raw));
      const metres=[5,2,1].map(n=>n*base).find(n=>n<=raw)??base;
      scale.querySelector('span').style.width=(metres/metresPerPixel)+'px';
      scale.querySelector('small').textContent='约 '+metres+' 米';
    }
    const n=document.getElementById('north');
    if(n){const p=controls.target.clone().project(camera),q=controls.target.clone().add(new THREE.Vector3(0,0,-100)).project(camera);n.style.transform='rotate('+THREE.MathUtils.radToDeg(Math.atan2((q.x-p.x)*width,(q.y-p.y)*height))+'deg)';}
  }
  animate();
  return {
    select(id){
      needsRender=true;
      projected.forEach(p=>p.label.classList.toggle('selected',p.id===id));
      if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose();outline=null;}
      const group=bodyGroups.get(id);if(!group)return;
      const bounds=new THREE.Box3().setFromObject(group), y=bounds.min.y+.09;
      const x0=bounds.min.x-1,x1=bounds.max.x+1,z0=bounds.min.z-1,z1=bounds.max.z+1;
      const points=[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]].map(([x,z])=>new THREE.Vector3(x,Math.max(y,heightAt(x,z)+.28),z));
      outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x316d5c}));
      scene.add(outline);
    },
    focus(id){const group=bodyGroups.get(id);if(!group)return;resize();const box=new THREE.Box3().setFromObject(group),offset=camera.position.clone().sub(controls.target);controls.target.copy(box.getCenter(new THREE.Vector3()));camera.position.copy(controls.target).add(offset);controls.update();fitBox(box,1.5);},
    fit:fitCampus,
    north(){const offset=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(0,offset.y,Math.hypot(offset.x,offset.z)));controls.update();},
    reset(){controls.minPolarAngle=Math.PI/7;controls.maxPolarAngle=Math.PI*.39;controls.enableRotate=true;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.ROTATE;controls.reset();fitCampus();canvas.dataset.top='false';},
    rotate(direction){if(!controls.enableRotate)return;const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),direction*Math.PI/4);camera.position.copy(controls.target).add(offset);controls.update();},
    zoom(factor){camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();needsRender=true;controls.update();},
    top(active){
      if(active){obliqueOffset=camera.position.clone().sub(controls.target);const distance=obliqueOffset.length();camera.position.copy(controls.target).add(new THREE.Vector3(0,distance,.001));controls.minPolarAngle=.00001;controls.maxPolarAngle=.00001;controls.enableRotate=false;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.touches.ONE=THREE.TOUCH.PAN;}
      else {controls.minPolarAngle=Math.PI/7;controls.maxPolarAngle=Math.PI*.39;controls.enableRotate=true;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.ROTATE;camera.position.copy(controls.target).add(obliqueOffset);}
      canvas.dataset.top=String(active);controls.update();
    },resize
  };
}
