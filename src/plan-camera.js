const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
};

const positive = (value, name) => {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
};

function checkView(view) {
  finite(view?.cx, 'view.cx');
  finite(view?.cy, 'view.cy');
  positive(view?.scale, 'view.scale');
}

function checkViewport(viewport) {
  positive(viewport?.width, 'viewport.width');
  positive(viewport?.height, 'viewport.height');
}

function checkPoint(point, name) {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new RangeError(`${name} must be an [x,y] point`);
  }
  point.forEach((value, index) => finite(value, `${name}[${index}]`));
}

function checkTouches(touches, name) {
  if (!Array.isArray(touches) || touches.length !== 2) {
    throw new RangeError(`${name} must contain two points`);
  }
  touches.forEach((point, index) => checkPoint(point, `${name}[${index}]`));
}

function scaleWithin(scale, limits) {
  positive(limits?.minScale, 'limits.minScale');
  positive(limits?.maxScale, 'limits.maxScale');
  if (limits.minScale > limits.maxScale) {
    throw new RangeError('limits.minScale must not exceed limits.maxScale');
  }
  return Math.min(limits.maxScale, Math.max(limits.minScale, scale));
}

function checkedView(cx, cy, scale) {
  const result = {cx, cy, scale};
  checkView(result);
  return result;
}

/** World points project as (world - center) * scale + viewport / 2. */
export function fitView(bounds, viewport, padding = 32) {
  checkViewport(viewport);
  finite(padding, 'padding');
  if (padding < 0) throw new RangeError('padding must not be negative');
  for (const key of ['minX', 'minY', 'maxX', 'maxY']) finite(bounds?.[key], `bounds.${key}`);
  const width = finite(bounds.maxX - bounds.minX, 'bounds.width');
  const height = finite(bounds.maxY - bounds.minY, 'bounds.height');
  if (width < 0 || height < 0) throw new RangeError('bounds must not be inverted');
  const innerWidth = positive(viewport.width - padding * 2, 'available viewport width');
  const innerHeight = positive(viewport.height - padding * 2, 'available viewport height');
  // A point or line still receives a usable view with at least one world unit.
  const scale = Math.min(innerWidth / Math.max(width, 1), innerHeight / Math.max(height, 1));
  return checkedView(bounds.minX + width / 2, bounds.minY + height / 2, scale);
}

export function panView(view, delta) {
  checkView(view);
  checkPoint(delta, 'delta');
  return checkedView(view.cx - delta[0] / view.scale, view.cy - delta[1] / view.scale, view.scale);
}

export function zoomAt(view, point, factor, limits, viewport) {
  checkView(view);
  checkViewport(viewport);
  checkPoint(point, 'point');
  positive(factor, 'factor');
  const scale = scaleWithin(view.scale * factor, limits);
  const dx = point[0] - viewport.width / 2;
  const dy = point[1] - viewport.height / 2;
  return checkedView(view.cx + dx / view.scale - dx / scale, view.cy + dy / view.scale - dy / scale, scale);
}

export function pinchView(view, startTouches, currentTouches, limits, viewport) {
  checkView(view);
  checkViewport(viewport);
  checkTouches(startTouches, 'startTouches');
  checkTouches(currentTouches, 'currentTouches');
  const midpoint = touches => [0, 1].map(axis => touches[0][axis] / 2 + touches[1][axis] / 2);
  const distance = touches => finite(Math.hypot(touches[1][0] - touches[0][0], touches[1][1] - touches[0][1]), 'touch distance');
  const start = midpoint(startTouches);
  const current = midpoint(currentTouches);
  const startDistance = distance(startTouches);
  const factor = startDistance > 0 ? distance(currentTouches) / startDistance : 1;
  const scale = scaleWithin(view.scale * factor, limits);
  // Preserve the world point under the start midpoint at the current midpoint.
  return checkedView(
    view.cx + (start[0] - viewport.width / 2) / view.scale - (current[0] - viewport.width / 2) / scale,
    view.cy + (start[1] - viewport.height / 2) / view.scale - (current[1] - viewport.height / 2) / scale,
    scale,
  );
}

export function visibleView(view, viewport) {
  checkView(view);
  checkViewport(viewport);
  const width = positive(viewport.width / view.scale, 'visible width');
  const height = positive(viewport.height / view.scale, 'visible height');
  return {
    x: finite(view.cx - width / 2, 'visible x'),
    y: finite(view.cy - height / 2, 'visible y'),
    width,
    height,
  };
}
