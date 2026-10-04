import './plan-review.css';
import plan from './plan-data.json';
import { fitView, zoomAt, panView, pinchView, visibleView } from './plan-camera.js';

const $ = selector => document.querySelector(selector);
const viewportElement = $('#map-viewport');
const svg = $('#plan-map');
const searchInput = $('#building-search');
const results = $('#search-results');
const detail = $('#building-detail');
const namespace = 'http://www.w3.org/2000/svg';
const fullBounds = { minX: 0, minY: 0, maxX: plan.reference.width, maxY: plan.reference.height };
const limits = { minScale: 0.06, maxScale: 5 };
const features = [...plan.buildings, ...plan.markers.map(marker => ({ ...marker, marker: true, category: 'pending' }))];
const featuresById = new Map(features.map(feature => [feature.id, feature]));
let viewport = { width: 1, height: 1 };
let view;
let initialView;
let selectedId = null;
let renderQueued = false;
let gesture = null;
const pointers = new Map();
const featureElements = new Map();
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const element = (tag, attributes, parent) => {
  const node = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
};
const coordinates = outline => outline.flatMap(item => Array.isArray(item) ? [item] : item.quadratic);
function boundsFor(feature) {
  if (feature.marker) return { minX: feature.pixel[0] - 35, minY: feature.pixel[1] - 35, maxX: feature.pixel[0] + 35, maxY: feature.pixel[1] + 35 };
  const points = feature.outlines.flatMap(part => coordinates(part.outline));
  return { minX: Math.min(...points.map(point => point[0])), minY: Math.min(...points.map(point => point[1])), maxX: Math.max(...points.map(point => point[0])), maxY: Math.max(...points.map(point => point[1])) };
}
// Leave label room for supplemental places beyond the reference raster; this is view padding, not a footprint.
for (const marker of plan.markers) {
  fullBounds.minX = Math.min(fullBounds.minX, marker.pixel[0] - 160);
  fullBounds.maxX = Math.max(fullBounds.maxX, marker.pixel[0] + 160);
  fullBounds.minY = Math.min(fullBounds.minY, marker.pixel[1] - 35);
  fullBounds.maxY = Math.max(fullBounds.maxY, marker.pixel[1] + 35);
}
function outlinePath(outline) {
  return outline.map((item, index) => Array.isArray(item) ? `${index ? 'L' : 'M'} ${item[0]} ${item[1]}` : `Q ${item.quadratic[0][0]} ${item.quadratic[0][1]} ${item.quadratic[1][0]} ${item.quadratic[1][1]}`).join(' ') + ' Z';
}
for (const sport of plan.sports) {
  const path = element('path', { d: outlinePath(sport.outline), class: 'sport-shape' }, $('#sports-layer'));
  element('title', {}, path).textContent = `${sport.name} · 影像轮廓待核`;
}
for (const feature of plan.buildings) {
  const group = element('g', { 'data-feature-id': feature.id }, $('#buildings-layer'));
  const parts = [];
  for (const part of feature.outlines) {
    const path = element('path', { d: [outlinePath(part.outline), ...(part.holes ?? []).map(outlinePath)].join(' '), 'fill-rule': 'evenodd', class: `building-shape${feature.name ? '' : ' pending'}` }, group);
    element('title', {}, path).textContent = `${feature.name ?? '名称待核'} · ${feature.id}`;
    parts.push(path);
  }
  featureElements.set(feature.id, parts);
}
for (const marker of plan.markers) {
  const group = element('g', { 'data-feature-id': marker.id }, $('#markers-layer'));
  const [x, y] = marker.pixel;
  const circle = element('circle', { cx: x, cy: y, r: 6, class: 'location-marker' }, group);
  const cross = element('path', { d: `M ${x - 11} ${y} H ${x + 11} M ${x} ${y - 11} V ${y + 11}`, class: 'location-cross' }, group);
  element('title', {}, group).textContent = `${marker.name} · ${marker.displayStatus ?? '仅定位，占地待核'}`;
  featureElements.set(marker.id, [circle, cross]);
}
const imageSource = window.__PLAN_REVIEW_IMAGE__;
if (typeof imageSource === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(imageSource)) {
  const image = element('image', { x: 0, y: 0, width: plan.reference.width, height: plan.reference.height, href: imageSource, opacity: 0.55, 'pointer-events': 'none' }, $('#reference-layer'));
  image.style.display = 'none';
  $('#image-controls').hidden = false;
  const updateImage = () => {
    image.style.display = $('#show-image').checked ? '' : 'none';
    image.setAttribute('opacity', Number($('#image-opacity').value) / 100);
    $('#image-opacity').disabled = !$('#show-image').checked;
    $('#map-mode').textContent = $('#show-image').checked ? '参考影像叠加' : '矢量模式';
  };
  $('#show-image').addEventListener('change', updateImage);
  $('#image-opacity').addEventListener('input', updateImage);
  updateImage();
} else {
  $('#map-mode').textContent = '矢量模式 · 无影像底图';
}
$('#stereo-link').href = window.__PLAN_REVIEW_SITE__ || import.meta.env.BASE_URL || './';
function screenPoint(event) {
  const rect = viewportElement.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}
const touchPoints = () => [...pointers.values()].slice(0, 2);
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function renderLabels() {
  const layer = $('#labels-layer');
  layer.replaceChildren();
  const candidates = features.map(feature => {
    const bounds = boundsFor(feature);
    return { id: feature.id, text: feature.label ?? feature.name ?? feature.id, world: feature.marker ? feature.pixel : [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2], named: !!feature.name, selected: selectedId === feature.id, priority: selectedId === feature.id ? 0 : ['library', 'boxue'].includes(feature.id) ? 1 : feature.name ? 2 : 4 };
  }).filter(label => label.named || label.selected || view.scale >= 0.72);
  if (view.scale >= 0.5) for (const sport of plan.sports) {
    const points = coordinates(sport.outline);
    candidates.push({ text: sport.name.replace(/跑道轮廓|区域|（名称待核对）/g, ''), world: [(Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2, (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2], sport: true, priority: 3 });
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const placed = [];
  for (const candidate of candidates) {
    const [x, y] = candidate.world;
    const sx = (x - view.cx) * view.scale + viewport.width / 2;
    const sy = (y - view.cy) * view.scale + viewport.height / 2;
    const fontSize = candidate.named || candidate.selected ? 12 : 10;
    const width = [...candidate.text].reduce((sum, character) => sum + (/[^\u0000-\u00ff]/.test(character) ? fontSize : fontSize * 0.6), 0) + 10;
    const height = fontSize + 9;
    const box = { x: sx - width / 2, y: sy - height / 2, width, height };
    if (sx < -width / 2 || sy < -height / 2 || sx > viewport.width + width / 2 || sy > viewport.height + height / 2) continue;
    if (!candidate.selected && placed.some(other => box.x < other.x + other.width + 3 && box.x + box.width + 3 > other.x && box.y < other.y + other.height + 3 && box.y + box.height + 3 > other.y)) continue;
    placed.push(box);
    const labelGroup = element('g', candidate.id ? { 'data-feature-id': candidate.id, class: 'feature-label' } : {}, layer);
    element('rect', { x: x - width / 2 / view.scale, y: y - height / 2 / view.scale, width: width / view.scale, height: height / view.scale, rx: 3 / view.scale, class: 'map-label-box' }, labelGroup);
    element('text', { x, y, 'font-size': fontSize / view.scale, class: `map-label${candidate.selected ? ' selected' : candidate.sport ? ' sport' : candidate.named ? '' : ' pending'}` }, labelGroup).textContent = candidate.text;
  }
}
function render() {
  if (!view) return;
  const visible = visibleView(view, viewport);
  svg.setAttribute('viewBox', `${visible.x} ${visible.y} ${visible.width} ${visible.height}`);
  for (const [id, elements] of featureElements) for (const node of elements) node.classList.toggle('selected', id === selectedId);
  for (const marker of plan.markers) {
    const [circle, cross] = featureElements.get(marker.id);
    const [x, y] = marker.pixel;
    circle.setAttribute('r', 6 / view.scale);
    cross.setAttribute('d', `M ${x - 11 / view.scale} ${y} H ${x + 11 / view.scale} M ${x} ${y - 11 / view.scale} V ${y + 11 / view.scale}`);
  }
  $('#zoom-level').textContent = `${Math.round(view.scale / initialView.scale * 100)}%`;
  $('#zoom-in').disabled = view.scale >= limits.maxScale - 1e-8;
  $('#zoom-out').disabled = view.scale <= limits.minScale + 1e-8;
  renderLabels();
}
function selectFeature(id, focus = false) {
  const feature = featuresById.get(id);
  if (!feature) { closeDetail(); return; }
  selectedId = id;
  const category = { teaching: '教学楼', study: '图书馆', service: '服务设施', pending: '类别待核' }[feature.category] ?? '类别待核';
  const sources = (feature.sourcePhotos ?? []).map(value => String(value).replace(/^photo-/, ''));
  const status = feature.marker ? feature.displayStatus ?? '仅定位 · 占地待核' : feature.name ? '测距与地面足迹待核' : '名称与轮廓待核';
  const note = feature.marker ? feature.detailNote ?? '当前只有中心定位标记，尚未确认占地轮廓。' : '轮廓依据影像屋面近似描绘，地面足迹与测距配准尚未完成。';
  detail.innerHTML = `<button type="button" class="detail-close" aria-label="关闭建筑详情">×</button><h2>${escape(feature.name ?? '名称待核')}</h2><p class="detail-meta">${escape(feature.id)}${feature.marker ? '' : ` · ${escape(category)}`}</p><span class="detail-status">${escape(status)}</span><p class="detail-note">${escape(note)}</p><p class="detail-sources">${sources.length ? `参考照片：${sources.map(escape).join('、')}` : '参考来源：影像描绘；交叉核对照片待补。'}</p>`;
  detail.hidden = false;
  detail.querySelector('button').addEventListener('click', closeDetail);
  $('#map-announcement').textContent = `已选择${feature.name ?? feature.id}，${feature.marker ? '占地待核' : '测距配准待核'}`;
  if (focus) {
    const bounds = boundsFor(feature);
    const center = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
    const scale = Math.min(limits.maxScale, Math.max(initialView.scale * 2.8, Math.min(viewport.width / Math.max(220, (bounds.maxX - bounds.minX) * 2), viewport.height / Math.max(320, (bounds.maxY - bounds.minY) * 2.4))));
    view = { cx: center[0], cy: center[1], scale };
    rebaseGesture();
  }
  requestRender();
}
function closeDetail() { selectedId = null; detail.hidden = true; requestRender(); }
function matchesFor(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return features.filter(feature => feature.id.toLocaleLowerCase().includes(normalized) || feature.name?.toLocaleLowerCase().includes(normalized)).sort((a, b) => (a.id.toLocaleLowerCase() === normalized ? -1 : b.id.toLocaleLowerCase() === normalized ? 1 : 0));
}
function renderSearch() {
  const query = searchInput.value.trim();
  $('#clear-search').hidden = !query;
  results.hidden = !query;
  if (!query) { results.replaceChildren(); return; }
  const matches = matchesFor(query);
  results.innerHTML = matches.length ? matches.slice(0, 12).map(feature => `<button type="button" data-id="${escape(feature.id)}"><span>${escape(feature.name ?? '名称待核')}</span><small>${escape(feature.id)}</small></button>`).join('') : '<p class="search-empty">未找到对应楼名或编号</p>';
  for (const button of results.querySelectorAll('button')) button.addEventListener('click', () => { selectFeature(button.dataset.id, true); results.hidden = true; searchInput.blur(); });
}
searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('focus', renderSearch);
$('#clear-search').addEventListener('click', () => { searchInput.value = ''; renderSearch(); searchInput.focus(); });
$('#search-form').addEventListener('submit', event => { event.preventDefault(); const first = matchesFor(searchInput.value)[0]; if (first) { selectFeature(first.id, true); results.hidden = true; searchInput.blur(); } });
document.addEventListener('pointerdown', event => { if (!$('#search-panel').contains(event.target)) results.hidden = true; });
function beginPan(pointerId, point, cancelled = false, featureId = null) {
  gesture = { type: 'pan', view: { ...view }, start: [...point], pointerId, cancelled, featureId, moved: false };
}
function rebaseGesture() {
  if (!gesture || !pointers.size) return;
  if (pointers.size >= 2) gesture = { type: 'pinch', view: { ...view }, startTouches: touchPoints(), cancelled: true };
  else { const [id, point] = [...pointers][0]; beginPan(id, point, true); }
}
svg.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (!view) return;
  event.preventDefault();
  const point = screenPoint(event);
  pointers.set(event.pointerId, point);
  svg.setPointerCapture(event.pointerId);
  svg.classList.add('dragging');
  if (pointers.size === 1) beginPan(event.pointerId, point, false, event.target.closest('[data-feature-id]')?.dataset.featureId ?? null);
  else if (pointers.size === 2) gesture = { type: 'pinch', view: { ...view }, startTouches: touchPoints(), cancelled: true };
});
svg.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault();
  const point = screenPoint(event);
  pointers.set(event.pointerId, point);
  if (gesture.type === 'pinch' && pointers.size >= 2) view = pinchView(gesture.view, gesture.startTouches, touchPoints(), limits, viewport);
  else if (gesture.type === 'pan' && event.pointerId === gesture.pointerId) {
    const delta = [point[0] - gesture.start[0], point[1] - gesture.start[1]];
    if (Math.hypot(...delta) > 5) gesture.moved = true;
    view = panView(gesture.view, delta);
  }
  requestRender();
});
function endPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  const clicked = !cancelled && gesture?.type === 'pan' && gesture.pointerId === event.pointerId && !gesture.moved && !gesture.cancelled;
  const clickedId = clicked ? gesture.featureId : null;
  pointers.delete(event.pointerId);
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  if (pointers.size === 1) { const [id, point] = [...pointers][0]; beginPan(id, point, true); }
  else if (!pointers.size) { gesture = null; svg.classList.remove('dragging'); }
  else gesture = { type: 'pinch', view: { ...view }, startTouches: touchPoints(), cancelled: true };
  if (clicked) { if (clickedId) selectFeature(clickedId); else closeDetail(); }
}
svg.addEventListener('pointerup', event => endPointer(event));
svg.addEventListener('pointercancel', event => endPointer(event, true));
svg.addEventListener('lostpointercapture', event => { if (pointers.has(event.pointerId)) endPointer(event, true); });
svg.addEventListener('wheel', event => {
  event.preventDefault();
  if (!view || pointers.size) return;
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
  view = zoomAt(view, screenPoint(event), Math.exp(-Math.max(-500, Math.min(500, pixels)) * 0.0018), limits, viewport);
  requestRender();
}, { passive: false });
const zoom = factor => { if (!view) return; view = zoomAt(view, [viewport.width / 2, viewport.height / 2], factor, limits, viewport); rebaseGesture(); requestRender(); };
$('#zoom-in').addEventListener('click', () => zoom(1.4));
$('#zoom-out').addEventListener('click', () => zoom(1 / 1.4));
const fitPadding = () => Math.min(viewport.width < 600 ? 26 : 42, Math.min(viewport.width, viewport.height) / 4);
function resetView() { if (!initialView) return; view = { ...initialView }; rebaseGesture(); closeDetail(); results.hidden = true; requestRender(); }
$('#fit-map').addEventListener('click', () => { if (!view) return; view = fitView(fullBounds, viewport, fitPadding()); rebaseGesture(); requestRender(); });
$('#reset-map').addEventListener('click', resetView);
viewportElement.addEventListener('keydown', event => {
  if (event.target !== viewportElement && event.target !== svg) return;
  if (!view) return;
  const deltas = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
  if (deltas[event.key]) { event.preventDefault(); view = panView(view, deltas[event.key]); rebaseGesture(); requestRender(); }
  else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.4); }
  else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.4); }
  else if (event.key === 'Home') { event.preventDefault(); resetView(); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { results.hidden = true; closeDetail(); } });
new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  if (!(width > 0 && height > 0)) return;
  const wasInitial = !view || (initialView && Math.abs(view.cx - initialView.cx) < 1e-6 && Math.abs(view.cy - initialView.cy) < 1e-6 && Math.abs(view.scale - initialView.scale) < 1e-6);
  viewport = { width, height };
  initialView = fitView(fullBounds, viewport, fitPadding());
  limits.minScale = Math.min(0.06, initialView.scale);
  if (wasInitial) view = { ...initialView };
  else view = { ...view, scale: Math.max(limits.minScale, Math.min(limits.maxScale, view.scale)) };
  rebaseGesture();
  requestRender();
}).observe(viewportElement);
