export const STORAGE_KEY = 'campus-canvas:v1';
export const DEFAULT_STATE = {version: 1, selectedId: null, floor: 1, roomId: null, favorites: []};
export function readState(storage, buildings) {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!raw || raw.version !== 1) return {...DEFAULT_STATE, favorites: []};
    const ids = new Set(buildings.map(b => b.id));
    const selectedId = ids.has(raw.selectedId) ? raw.selectedId : null;
    const building = buildings.find(b => b.id === selectedId);
    const floor = building?.floors?.includes(raw.floor) ? raw.floor : building?.floors?.[0] || 1;
    const roomId = building?.rooms.some(r => r.id === raw.roomId && r.floor === floor) ? raw.roomId : null;
    return {version: 1, selectedId, floor, roomId, favorites: Array.isArray(raw.favorites) ? [...new Set(raw.favorites.filter(id => ids.has(id)))] : []};
  } catch { return {...DEFAULT_STATE, favorites: []}; }
}
export function writeState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function searchCampus(buildings, query, category = 'all') {
  const q = query.trim().toLocaleLowerCase('zh-CN');
  return buildings.filter(b => category === 'all' || b.category === category).flatMap(b => {
    const matchesBuilding = [b.name, ...b.aliases].some(t => t.toLocaleLowerCase('zh-CN').includes(q));
    if (!q || matchesBuilding) return [{kind: 'building', building: b}];
    return b.rooms.filter(r => [r.name, r.number || '', ...r.tags].some(t => t.toLocaleLowerCase('zh-CN').includes(q)))
      .map(room => ({kind: 'room', building: b, room}));
  });
}
export function isTap(gesture, pointerId, x, y, time) {
  return !!gesture && !gesture.cancelled && !gesture.multi && gesture.id === pointerId &&
    gesture.maxDistance <= 7 && Math.hypot(x-gesture.x, y-gesture.y) <= 7 && time-gesture.time < 600;
}
