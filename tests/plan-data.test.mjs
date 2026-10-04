import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const plan = JSON.parse(fs.readFileSync(new URL('../src/plan-data.json', import.meta.url), 'utf8'));
const buildings = new Map(plan.buildings.map(building => [building.id, building]));
const coordinates = outline => outline.flatMap(item => Array.isArray(item) ? [item] : item.quadratic);

test('review features remain addressable by unique identifiers and legacy part identifiers', () => {
  const identifiers = [...plan.buildings, ...plan.markers, ...plan.sports].flatMap(feature => [feature.id, ...(feature.aliases ?? [])]);
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const [groupId, expectedParts] of [['swimming-centre', ['S21', 'S22']], ['ligong-1', ['N12', 'N13', 'N14']]]) {
    const group = buildings.get(groupId);
    assert.deepEqual(group.aliases, expectedParts);
    assert.deepEqual(group.outlines.map(part => part.id), expectedParts);
    assert.ok(expectedParts.every(id => !buildings.has(id)));
  }
});

test('school-owned places outside the screenshot blue reference remain in the review with explicit incomplete roofs', () => {
  for (const id of ['zhixin', 'swimming-centre']) {
    const building = buildings.get(id);
    assert.equal(building.ownershipStatus, 'user-confirmed-school-owned');
    assert.equal(building.boundaryStatus, 'outside-user-screenshot-blue-reference');
    assert.equal(building.outlineIsComplete, false);
    assert.ok(building.outlines.length && building.outlines.every(part => part.outline.length >= 3));
  }
  assert.ok(buildings.get('zhixin').outlines.some(part => coordinates(part.outline).some(point => point[0] < 0)));
  assert.ok(!plan.markers.some(marker => marker.id === 'zhixin'), 'old entrance photo position must not appear as a second building');
  assert.match(buildings.get('zhixin').detailNote, /验证覆盖之外/);
});

test('new geometry is finite, uncertainty survives grouping, and original courtyard curves and holes survive', () => {
  for (const building of plan.buildings) {
    for (const part of building.outlines) {
      for (const outline of [part.outline, ...(part.holes ?? [])]) {
        assert.ok(outline.length >= 3);
        assert.ok(coordinates(outline).every(point => point.length === 2 && point.every(Number.isFinite)), building.id);
      }
    }
  }
  for (const id of ['S23', 'N18', 'S24', 'S25', 'S26']) assert.equal(buildings.get(id).outlineIsComplete, false, id);
  assert.ok(buildings.get('S08').outlines.some(part => part.holes?.length));
  assert.ok(buildings.get('library').outlines.some(part => part.outline.some(item => !Array.isArray(item) && item.quadratic)));
  assert.match(buildings.get('S20').displayStatus, /不确定是否有屋盖/);
  assert.equal(buildings.get('N15').name, '雨盖篮球场');
});

test('published review data includes source descriptions without private raster or original location metadata', () => {
  const text = JSON.stringify(plan);
  assert.doesNotMatch(text, /data:image|base64|xwechat_files|AppData|EXIF|GPSLatitude|GPSLongitude|C:[\\/]|D:[\\/]/i);
  assert.ok(plan.registration.limits.some(note => note.includes('验证范围外')));
  assert.ok(plan.notes.some(note => note.includes('蓝线不作为建筑裁切')));
});
