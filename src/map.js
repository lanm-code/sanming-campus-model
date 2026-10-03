import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { isTap } from './state.js';

export function createCampusMap(container, buildings, onSelect, onError) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
  } catch {
    onError('当前设备未能开启立体地图，可继续用左侧地点与楼层清单查找。');
    return {select(){}, focus(){}, reset(){}, rotate(){}, zoom(){}, top(){}, resize(){}};
  }
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '校园立体地图；使用旁边的地点列表也可选择建筑');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.dataset.renderer = 'ready';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xeaf0e9, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-80,80,80,-80,0.1,650);
  camera.position.set(100,110,150);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,0,-6);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.screenSpacePanning = false;
  controls.minZoom=.65; controls.maxZoom=3.8;
  controls.minPolarAngle=Math.PI/7; controls.maxPolarAngle=Math.PI*.39;
  controls.mouseButtons = {LEFT:THREE.MOUSE.PAN, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.ROTATE};
  controls.touches = {ONE:THREE.TOUCH.PAN, TWO:THREE.TOUCH.DOLLY_ROTATE};
  controls.update(); controls.saveState();
  scene.add(new THREE.HemisphereLight(0xffffff,0x78866f,3));
  const sun=new THREE.DirectionalLight(0xfff5df,3);
  sun.position.set(-60,100,70); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-100,right:100,top:100,bottom:-100,near:1,far:250});
  sun.shadow.bias=-.002;
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
    dark:new THREE.MeshStandardMaterial({color:0x37545a,roughness:.5})
  };
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
  function tree(x,z,size=1) {
    const group=new THREE.Group();
    box(group,.55,2,.55,0,0,0,materials.trunk);
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.1,1),materials.tree);
    crown.position.y=3.4; crown.scale.set(1,1.15,1);crown.castShadow=true; group.add(crown);
    group.position.set(x,0,z);group.scale.setScalar(size);scene.add(group);
  }
  const landscape=new THREE.Group();scene.add(landscape);
  box(landscape,134,1.2,149,0,-1.5,-10,materials.grass);
  box(landscape,134,2,149,0,-3.5,-10,materials.foundation);
  const labels=document.createElement('div');labels.className='map-labels';container.append(labels);
  const projected=[];
  for(const b of buildings.filter(b=>b.model)){
    const g=new THREE.Group();g.position.fromArray(b.position);g.userData.buildingId=b.id;
    if(b.model==='library'){
      box(g,42,.8,32,0,0,0,materials.foundation);
      block(g,11,17,22,-13,.8,-2,5,3);
      block(g,11,26,22,13,.8,-2,8,3);
      block(g,19,10,11,0,.8,-9,3,5);
      const entry=new THREE.Mesh(new THREE.CylinderGeometry(14,14,6,32,1,false,-Math.PI/2,Math.PI),materials.trim);
      entry.position.set(0,3.8,8);entry.scale.z=.54;entry.castShadow=true;g.add(entry);
      box(g,20,4,.5,0,.8,12,materials.glass);
      box(g,18,.7,4,0,6.8,10,materials.trim);
      stairs(g,24,.8,4,0,17,4);
      box(g,.65,17,1,-18,.8,9,materials.glass);
      box(g,.65,26,1,18,.8,9,materials.glass);
    } else if(b.model==='boxue'){
      box(g,47,1.2,35,0,0,0,materials.foundation);
      block(g,38,20,8,0,1.2,-11,6,12);
      block(g,38,20,8,0,1.2,11,6,12);
      block(g,8,20,15,15,1.2,0,6,4);
      block(g,8,20,15,-15,1.2,0,6,4);
      box(g,12,4.5,7,11,1.2,18,materials.path);
      const curve=new THREE.Mesh(new THREE.CylinderGeometry(5,5,13,20),materials.glass);
      curve.position.set(19,12.2,11);curve.castShadow=true;g.add(curve);
      box(g,8,3.7,.35,11,5.7,15.1,materials.dark);
      stairs(g,10,5.7,14,11,28,10);
      box(g,7,3.4,.3,-9,1.2,-15.2,materials.dark);
    } else {
      box(g,47,4,28,0,0,0,materials.foundation);
      block(g,42,28,15,0,4,-3,9,13);
      box(g,8,26,.5,0,4,4.6,materials.glass);
      box(g,20,2,9,0,9,9,materials.trim);
      for(const x of [-8,-4,4,8])box(g,.8,5,.8,x,4,11,materials.trim);
      box(g,10,4,.35,0,4,5,materials.dark);
      stairs(g,24,4,12,0,20,8);
      box(g,38,.2,17,0,-.05,35,materials.path);
    }
    g.traverse(m=>{if(m.isMesh){pickable.push(m);}});
    scene.add(g);bodyGroups.set(b.id,g);
    const label=document.createElement('button');
    label.className='map-label';label.type='button';label.textContent=b.name;
    label.dataset.building=b.id;label.setAttribute('aria-label','查看'+b.name);
    label.addEventListener('click',()=>onSelect(b.id));labels.append(label);
    projected.push({label,id:b.id,position:new THREE.Vector3(b.position[0],b.labelHeight,b.position[2])});
  }
  const trees=[[-55,34],[-52,18],[-54,-3],[-51,-22],[-42,-49],[-33,-64],[-18,-68],[26,-64],[39,-52],[51,-33],[56,-12],[59,11],[53,37],[42,53],[22,54],[2,47],[-15,49],[-33,46]];
  trees.forEach(([x,z],i)=>tree(x,z,.75+(i%3)*.12));
  let outline=null;
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
    const aspect=width/height, extent=Math.max(86,95/aspect);
    camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;
    camera.updateProjectionMatrix();renderer.setSize(width,height);
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function animate(){
    requestAnimationFrame(animate);if(document.hidden)return;
    controls.update();
    const clamped=controls.target.clone();clamped.x=THREE.MathUtils.clamp(clamped.x,-72,72);clamped.z=THREE.MathUtils.clamp(clamped.z,-82,72);
    const correction=clamped.clone().sub(controls.target);
    camera.position.add(correction);controls.target.copy(clamped);
    renderer.render(scene,camera);
    const width=container.clientWidth,height=container.clientHeight, placed=[];
    projected.forEach(p=>{
      const v=p.position.clone().project(camera), x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;
      const overlaps=placed.some(a=>Math.abs(a.x-x)<125 && Math.abs(a.y-y)<35);
      const visible=v.z>=-1&&v.z<=1&&x>24&&x<width-24&&y>26&&y<height-26&&(!overlaps||p.label.classList.contains('selected'));
      p.label.hidden=!visible;
      if(visible){p.label.style.transform='translate(-50%,-100%) translate('+x+'px,'+y+'px)';placed.push({x,y});}
    });
    canvas.dataset.angle=String(Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())));
    canvas.dataset.zoom=camera.zoom.toFixed(2);
  }
  animate();
  return {
    select(id){
      projected.forEach(p=>p.label.classList.toggle('selected',p.id===id));
      if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose();outline=null;}
      const group=bodyGroups.get(id);if(!group)return;
      const b=buildings.find(b=>b.id===id);
      const size=b.model==='boxue'?[49,48]:b.model==='library'?[45,37]:[50,42];
      const x=b.position[0],z=b.position[2],y=.09;
      const points=[[-size[0]/2,-size[1]/2],[size[0]/2,-size[1]/2],[size[0]/2,size[1]/2],[-size[0]/2,size[1]/2],[-size[0]/2,-size[1]/2]].map(([dx,dz])=>new THREE.Vector3(x+dx,y,z+dz));
      outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x316d5c}));
      scene.add(outline);
    },
    focus(id){const b=buildings.find(b=>b.id===id);if(!b?.position)return;const offset=camera.position.clone().sub(controls.target);controls.target.set(b.position[0],0,b.position[2]);camera.position.copy(controls.target).add(offset);controls.update();},
    reset(){controls.minPolarAngle=Math.PI/7;controls.maxPolarAngle=Math.PI*.39;controls.enableRotate=true;controls.reset();canvas.dataset.top='false';},
    rotate(direction){if(!controls.enableRotate)return;const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),direction*Math.PI/4);camera.position.copy(controls.target).add(offset);controls.update();},
    zoom(factor){camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();controls.update();},
    top(active){
      if(active){const distance=camera.position.distanceTo(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(0,distance,.001));controls.minPolarAngle=.00001;controls.maxPolarAngle=.00001;controls.enableRotate=false;}
      else {controls.minPolarAngle=Math.PI/7;controls.maxPolarAngle=Math.PI*.39;controls.enableRotate=true;controls.reset();}
      canvas.dataset.top=String(active);controls.update();
    },resize
  };
}
