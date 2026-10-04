import './style.css';
import {buildings, sourceUrl} from './data.js';
import {readState, writeState, searchCampus} from './state.js';
import {createCampusMap} from './map.js';

const paths={
  map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  building:'M4 21V7l8-4 8 4v14 M2 21h20 M8 9h1 M15 9h1 M8 13h1 M15 13h1 M10 21v-4h4v4',
  book:'M12 5v16 M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 1 4 4 0 0 0-4-1H3z',
  layers:'m12 3 10 6-10 6L2 9z M2 13l10 6 10-6 M2 17l10 6 10-6',
  arrow:'M5 12h14 M13 6l6 6-6 6',
  close:'M6 6l12 12 M6 18 18 6',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  plus:'M12 5v14 M5 12h14',
  minus:'M5 12h14',
  reset:'M4 8a9 9 0 1 1 0 8 M4 3v5h5',
  rotate:'M3 11a9 9 0 1 1 3 8 M3 5v6h6',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  info:'M12 11v6 M12 7v.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  menu:'M4 6h16 M4 12h16 M4 18h16',
  check:'m5 12 4 4 10-10',
  chevron:'m9 5 7 7-7 7'
};
const icon=(name,cls='')=>'<svg class="icon '+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.building)+'"/></svg>';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=window.localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('unavailable');}};}
let state=readState(storage,buildings), category='all', query='', topView=false;
const app=document.querySelector('#app');
app.innerHTML=`
<header class="header">
  <a class="brand" href="./" aria-label="Campus Canvas 首页"><span class="brand-mark">${icon('map')}</span><span><strong>Campus Canvas</strong><small>三明学院 · 校园空间</small></span></a>
  <div class="header-center"><span class="version-dot"></span>核心建筑平面校对 <span class="version">v0.4</span></div>
  <div class="header-actions"><a class="plan-entry" href="./plan.html" aria-label="打开二维平面核对地图" title="二维平面核对地图">${icon('map')}<span>平面核对</span></a><span id="network" class="network"></span><button class="text-button" id="about">${icon('info')}<span>资料说明</span></button><button class="icon-button mobile-only" id="explore" aria-label="打开地点列表" aria-expanded="false">${icon('menu')}</button></div>
</header>
<main class="workspace">
  <button id="scrim" class="scrim" aria-label="关闭地点列表" hidden></button>
  <aside class="explorer" aria-label="地点列表">
    <div class="explorer-heading"><div><span class="eyebrow">EXPLORE CAMPUS</span><h1>探索明院</h1></div><span class="counter">${buildings.filter(b=>b.model).length}<span>建筑与轮廓</span></span></div>
    <label class="search">${icon('search')}<input id="search" type="search" placeholder="搜索建筑、教室名称或编号" autocomplete="off" aria-label="搜索建筑、教室名称或编号"/></label>
    <div class="filters" role="group" aria-label="地点分类"><button data-category="all" class="active" aria-pressed="true">全部</button><button data-category="teaching" aria-pressed="false">教学</button><button data-category="study" aria-pressed="false">学习</button><button data-category="service" aria-pressed="false">服务</button><button data-category="saved" aria-pressed="false">收藏</button></div>
    <div class="list-caption"><span id="result-title">校园地点</span><span id="result-count"></span></div><div id="results" class="results"></div>
    <div class="explorer-footer"><span class="tiny-dot"></span><div><strong>从真实资料出发</strong><p>建筑参考现场照片<br>教室保留原有名称与编号</p></div></div>
  </aside>
  <section class="map-area" aria-label="校园地图">
    <div class="map-heading"><span class="pill">${icon('layers')}2.5D 校园</span><span class="map-note">平面校对中 · 地形为示意</span><button id="north" class="north" title="朝北" aria-label="地图朝北">↑ N</button></div>
    <details class="map-legend"><summary>${icon('layers')}<span>图例</span></summary><div class="legend-content"><strong>地块与道路</strong><span><i class="swatch lawn"></i>绿地</span><span><i class="swatch plaza"></i>广场 / 硬地</span><span><i class="swatch teaching"></i>教学地块</span><span><i class="swatch living"></i>生活地块</span><span><i class="swatch sports"></i>运动场地</span><span><i class="swatch road"></i>校内道路</span><span><i class="swatch regional"></i>周边道路</span><span><i class="swatch boundary"></i>截图参考边界</span><small>地块分类为示意；灰色建筑为边界外参照。行政楼周边坡面尚待校正，真实高程未知。</small></div></details>
    <div id="map" class="map-canvas"></div>
    <div id="map-error" class="map-error" role="status" hidden></div>
    <div class="view-tools" role="group" aria-label="地图视角">
      <button id="rotate-left" title="向左旋转45度" aria-label="向左旋转45度">${icon('rotate','flip')}</button>
      <button id="rotate-right" title="向右旋转45度" aria-label="向右旋转45度">${icon('rotate')}</button>
      <span></span><button id="top" aria-pressed="false" title="俯视地图">2D</button>
      <button id="reset" title="恢复默认视角" aria-label="恢复默认视角">${icon('reset')}</button>
      <button id="fit-campus" class="fit-campus" title="查看全校园工作范围" aria-label="查看全校园工作范围">全览</button>
    </div>
    <div class="zoom-tools"><button id="zoom-in" aria-label="放大地图">${icon('plus')}</button><button id="zoom-out" aria-label="缩小地图">${icon('minus')}</button></div>
    <div class="map-guide"><span>${icon('pin')}点击建筑，了解空间</span><small><span class="desktop-guide">左键滑动旋转 · 滚轮缩放 · 右键平移</span><span class="mobile-guide">单指旋转 · 双指缩放与平移</span></small></div>
    <div id="map-scale" class="map-scale" aria-label="地图近似比例尺"><span></span><small></small></div>
    <div class="map-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://goto.arcgisonline.com/maps/World_Imagery" target="_blank" rel="noopener noreferrer">影像参考：Esri 等</a></div>
  </section>
  <aside id="detail" class="detail" aria-label="地点详情" hidden></aside>
</main>
<dialog id="about-dialog" aria-labelledby="about-title"><div class="dialog-heading"><h2 id="about-title">资料与当前范围</h2><button id="close-about" class="icon-button" aria-label="关闭资料说明">${icon('close')}</button></div><p>本轮重描图书馆与博学楼的近似平面。图书馆正门朝东、高翼在北、低翼在南；博学楼保留长短不同的三翼、东侧连接体与两处向西敞开的院落。其余建筑及行政楼周边地形继续核对。蓝色虚线仍为手机截图配准的主校园参考范围。</p><div class="notice">蓝色虚线来自地图截图配准，并非测绘校界。地块颜色表示近似用途。照片确认的局部高低关系用台地、台阶、坡道和桥下空间表现；所有高度都是可调显示值，未核对区域保留参考面；行政楼后坡尚未重建，当前地形不能用于比较各楼真实地势。道路宽度、建筑高度与通行性待核对，不提供导航。</div><h3>整体尺度</h3><p>建模工作框东西约0.74公里、南北约1.28公里，用于容纳校园及周边参照。学校公布占地1429亩（约95.27万平方米），这一统计与截图中的主校园参考范围口径可能不同，不能用它直接放大轮廓。</p><h3>保留真实名称</h3><p>未确认身份的建筑保留“轮廓”编号。“综合实验楼分布索引”与博学楼的归属待核对，暂时单列楼层资料。408前门、后门分别保留；教室具体门位尚未标注。</p><h3>接下来</h3><p>接下来优先校对行政楼、学院街和北区食堂之间的坡面、台阶与平台，再扩展其余建筑和道路。天气、室内家具布置和APK在后续版本接入。</p><a class="source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">学校官方校园示意图 ${icon('arrow')}</a><br><a class="source-link" href="https://www.fjsmu.edu.cn/xxjj/list.htm" target="_blank" rel="noopener noreferrer">学校官方占地统计 ${icon('arrow')}</a><small class="dialog-footnote">道路/运动场几何：© OpenStreetMap contributors，通行性待核对；与建筑冲突的路段暂时隐藏。参考影像：Esri, Vantor, Earthstar Geographics, and the GIS User Community；影像拍摄日期未知。原始截图、影像与现场照片不随网站发布。收藏和浏览位置保存在本机；清理浏览器数据会移除它们。</small></dialog>
<div id="toast" class="toast" role="status" hidden></div>`;
const $=id=>document.getElementById(id);
function persist(){if(!writeState(storage,state))notify('本机存储不可用，此次浏览记录不会保存。');}
let timer;
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4200);}
function updateNetwork(){ $('network').textContent=navigator.onLine?'本地资料':'离线浏览';$('network').classList.toggle('offline',!navigator.onLine);}
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);updateNetwork();
function setExplorer(open){document.querySelector('.explorer').classList.toggle('open',open);$('scrim').hidden=!open;$('explore').setAttribute('aria-expanded',String(open));}
$('explore').addEventListener('click',()=>setExplorer($('explore').getAttribute('aria-expanded')!=='true'));
$('scrim').addEventListener('click',()=>setExplorer(false));
function renderResults(){
  let list=searchCampus(buildings,query,category==='saved'?'all':category);
  if(category==='saved')list=list.filter(item=>state.favorites.includes(item.building.id));
  $('result-title').textContent=query?'查找结果':category==='saved'?'我的收藏':'校园地点';
  $('result-count').textContent=list.length+' 项';
  $('results').innerHTML=list.length?list.map(item=>{
    const b=item.building, r=item.room, selected=r?state.roomId===r.id:state.selectedId===b.id;
    return '<button class="place '+(selected?'selected':'')+'" data-id="'+b.id+'" '+(r?'data-room="'+r.id+'"':'')+' aria-pressed="'+selected+'"><span class="place-symbol '+b.category+'">'+icon(r?'layers':b.category==='study'?'book':'building')+'</span><span class="place-text"><strong>'+escape(r?(r.number?r.number+' · ':'')+r.name:b.name)+'</strong><small>'+escape(r?b.name+' · '+r.floor+'F':b.categoryLabel+' · '+(b.model?'可查看样片':'归属待核对'))+'</small></span>'+icon('chevron','place-chevron')+'</button>';
  }).join(''):'<div class="empty">'+icon('search')+'<strong>'+(category==='saved'&&!query?'还没有收藏':'没有匹配的地点')+'</strong><p>'+(category==='saved'&&!query?'打开地点详情，点击星标收藏。':'试试“图书馆”“401”或“新闻演播厅”。')+'</p></div>';
  $('results').querySelectorAll('[data-id]').forEach(button=>button.addEventListener('click',()=>selectBuilding(button.dataset.id,button.dataset.room)));
}
function selectBuilding(id,roomId){
  const b=buildings.find(b=>b.id===id);if(!b)return;
  const r=b.rooms.find(r=>r.id===roomId);
  const previous=state.selectedId;
  state.selectedId=id;
  state.floor=r?r.floor:previous===id&&b.floors.includes(state.floor)?state.floor:b.floors[0]||1;
  state.roomId=r?.id||null;persist();map.select(id);renderResults();renderDetail();setExplorer(false);
  if(r)requestAnimationFrame(()=>document.getElementById('room-'+r.id)?.scrollIntoView({block:'nearest'}));
}
function renderDetail(){
  const b=buildings.find(b=>b.id===state.selectedId);
  const detail=$('detail');detail.hidden=!b;if(!b){app.classList.remove('has-detail');return;}
  const roomScroll = detail.dataset.building===b.id && detail.dataset.floor===String(state.floor) ? detail.querySelector('.room-list')?.scrollTop || 0 : 0;
  detail.dataset.building=b.id; detail.dataset.floor=String(state.floor);
  app.classList.add('has-detail');
  const favorite=state.favorites.includes(b.id);
  const rooms=b.rooms.filter(r=>r.floor===state.floor);
  detail.innerHTML='<div class="detail-top"><span class="eyebrow">'+(b.model?'CAMPUS PLACE':'FLOOR ARCHIVE')+'</span><button id="close-detail" class="icon-button" aria-label="关闭地点详情">'+icon('close')+'</button></div>'+
    '<div class="detail-title"><h2>'+escape(b.name)+'</h2><button id="favorite" class="icon-button favorite '+(favorite?'active':'')+'" aria-label="'+(favorite?'取消收藏':'收藏地点')+'" aria-pressed="'+favorite+'">'+icon('star')+'</button></div>'+
    '<div class="detail-tags"><span>'+escape(b.categoryLabel)+'</span><span class="neutral">'+(b.model?'影像近似位置':'建筑归属待核对')+'</span></div>'+
    '<p class="description">'+escape(b.description)+'</p>'+
    (b.model?'<button id="focus-building" class="focus-button">'+icon('pin')+'聚焦建筑</button>':'')+
    '<section class="floor-section"><div class="section-title"><h3>'+icon('layers')+'楼层与教室</h3>'+(b.floors.length?'<span>'+rooms.length+' 个空间</span>':'')+'</div>'+
    (b.floors.length?'<div class="floors" role="group" aria-label="选择楼层">'+b.floors.map(f=>'<button data-floor="'+f+'" class="'+(f===state.floor?'active':'')+'" aria-pressed="'+(f===state.floor)+'">'+f+'F</button>').join('')+'</div><p class="floor-note">索引记录 · '+state.floor+'F · 门位未标注</p><div class="room-list">'+rooms.map(r=>'<button id="room-'+r.id+'" class="room '+(state.roomId===r.id?'active':'')+'" data-room="'+r.id+'" aria-pressed="'+(state.roomId===r.id)+'"><span class="room-number">'+escape(r.number||'—')+'</span><span class="room-text"><strong>'+escape(r.name)+'</strong><small>'+escape(r.tags.join(' · '))+'</small></span>'+icon('chevron')+'</button>').join('')+'</div><p id="room-status" class="room-status" role="status">'+(state.roomId?'已找到所属楼层；该教室具体位置尚未标注。':'按楼层浏览，保留资料中的名称与编号。')+'</p>':
      '<div class="floor-empty">'+icon('layers')+'<p>'+escape(b.floorNote)+'</p><button id="open-index">查看综合实验楼索引 '+icon('arrow')+'</button></div>')+'</section>'+
    '<details class="evidence"><summary>资料来源与空间关系 '+icon('info')+'</summary><ul>'+b.facts.map(f=>'<li>'+escape(f)+'</li>').join('')+'</ul><p>'+b.sources.map(escape).join('<br>')+'</p></details>';
  $('close-detail').addEventListener('click',()=>{
    state.selectedId=null;state.roomId=null;persist();map.select(null);renderResults();renderDetail();
  });
  if(detail.querySelector('.room-list')) detail.querySelector('.room-list').scrollTop=roomScroll;
  $('favorite').addEventListener('click',()=>{
    state.favorites=favorite?state.favorites.filter(id=>id!==b.id):[...state.favorites,b.id];persist();renderResults();renderDetail();
  });
  $('focus-building')?.addEventListener('click',()=>map.focus(b.id));
  $('open-index')?.addEventListener('click',()=>selectBuilding('experiment-index'));
  detail.querySelectorAll('[data-floor]').forEach(button=>button.addEventListener('click',()=>{
    state.floor=Number(button.dataset.floor);state.roomId=null;persist();renderDetail();renderResults();
  }));
  detail.querySelectorAll('[data-room]').forEach(button=>button.addEventListener('click',()=>{
    state.roomId=button.dataset.room;persist();renderDetail();renderResults();
    document.getElementById('room-'+state.roomId)?.focus({preventScroll:true});
  }));
}
$('search').addEventListener('input',e=>{query=e.target.value;renderResults();});
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
  category=button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderResults();
}));
const dialog=$('about-dialog');
$('about').addEventListener('click',()=>dialog.showModal());
$('close-about').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog&&e.offsetX>=0&&e.offsetY>=0){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)setExplorer(false);});
const map=createCampusMap($('map'),buildings,id=>selectBuilding(id),message=>{$('map-error').textContent=message;$('map-error').hidden=false;});
$('rotate-left').addEventListener('click',()=>map.rotate(-1));
$('rotate-right').addEventListener('click',()=>map.rotate(1));
$('fit-campus').addEventListener('click',()=>map.fit());
$('north').addEventListener('click',()=>map.north());
$('zoom-in').addEventListener('click',()=>map.zoom(1.2));$('zoom-out').addEventListener('click',()=>map.zoom(1/1.2));
$('top').addEventListener('click',()=>{
  topView=!topView;map.top(topView);$('top').setAttribute('aria-pressed',String(topView));$('top').textContent=topView?'2.5D':'2D';
  $('rotate-left').disabled=topView;$('rotate-right').disabled=topView;
});
$('reset').addEventListener('click',()=>{
  map.reset();topView=false;$('top').textContent='2D';$('top').setAttribute('aria-pressed','false');
  $('rotate-left').disabled=false;$('rotate-right').disabled=false;
});
renderResults();renderDetail();map.select(state.selectedId);
