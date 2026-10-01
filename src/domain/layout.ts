/**
 * Reglas de colocación: restricciones (habitación, pilares, colisiones),
 * imanes (snapping) y cálculo de huecos para el "ajuste por pilares".
 *
 * Todo es lógica pura: no depende de Three.js, así que se prueba con tests
 * unitarios y podría reutilizarse en el servidor para validar un pedido.
 */
import {
  aabbOf,
  convexOverlap,
  footprint,
  intervalOverlap,
  normalizeDeg,
  pillarPolygon,
  type AABB,
  type Vec2,
} from './geometry2d';
import type { FurnitureItem, ProjectState, Room } from './types';

/** Distancia (mm) a la que actúa el imán. */
export const SNAP_DISTANCE = 80;

export type Obstacle =
  | { kind: 'item'; id: string; polygon: Vec2[]; box: AABB; zMin: number; zMax: number }
  | { kind: 'pillar'; id: string; polygon: Vec2[]; box: AABB; zMin: number; zMax: number };

/** Intervalo vertical ocupado por un mueble. */
export function verticalRange(item: FurnitureItem): [number, number] {
  return [item.elevation, item.elevation + item.height];
}

export function itemBox(item: FurnitureItem): AABB {
  return aabbOf(footprint(item));
}

/** Obstáculos relevantes para un mueble (todos menos él mismo). */
export function obstaclesFor(state: ProjectState, itemId: string): Obstacle[] {
  const result: Obstacle[] = [];
  for (const other of state.items) {
    if (other.id === itemId) continue;
    const polygon = footprint(other);
    const [zMin, zMax] = verticalRange(other);
    result.push({ kind: 'item', id: other.id, polygon, box: aabbOf(polygon), zMin, zMax });
  }
  for (const p of state.room.pillars) {
    const polygon = pillarPolygon(p);
    result.push({ kind: 'pillar', id: p.id, polygon, box: aabbOf(polygon), zMin: 0, zMax: state.room.height });
  }
  return result;
}

/** Un obstáculo solo bloquea si comparte altura: un mueble alto pasa por encima de uno bajo. */
function sharesHeight(item: FurnitureItem, o: Obstacle): boolean {
  const [zMin, zMax] = verticalRange(item);
  return intervalOverlap(zMin, zMax, o.zMin, o.zMax) > 0.5;
}

export function insideRoom(item: FurnitureItem, room: Room, tolerance = 0.5): boolean {
  const b = itemBox(item);
  return (
    b.minX >= -tolerance &&
    b.minY >= -tolerance &&
    b.maxX <= room.width + tolerance &&
    b.maxY <= room.depth + tolerance &&
    item.elevation + item.height <= room.height + tolerance
  );
}

/** Devuelve con qué choca un mueble en una posición candidata (vacío si es válida). */
export function collisions(item: FurnitureItem, state: ProjectState): Obstacle[] {
  const poly = footprint(item);
  return obstaclesFor(state, item.id).filter((o) => sharesHeight(item, o) && convexOverlap(poly, o.polygon));
}

export function isValidPlacement(item: FurnitureItem, state: ProjectState): boolean {
  return insideRoom(item, state.room) && collisions(item, state).length === 0;
}

/** Desplaza el mueble lo mínimo para que quede dentro de la habitación. */
export function clampToRoom(item: FurnitureItem, room: Room): FurnitureItem {
  const b = itemBox(item);
  let dx = 0;
  let dy = 0;
  if (b.minX < 0) dx = -b.minX;
  else if (b.maxX > room.width) dx = room.width - b.maxX;
  if (b.minY < 0) dy = -b.minY;
  else if (b.maxY > room.depth) dy = room.depth - b.maxY;
  return dx || dy ? { ...item, x: item.x + dx, y: item.y + dy } : item;
}

export interface SnapResult {
  item: FurnitureItem;
  /** Con qué se ha alineado en cada eje (para mostrarlo en la interfaz). */
  snappedX: string | null;
  snappedY: string | null;
}

/**
 * Imanes: si un borde del mueble queda cerca (< SNAP_DISTANCE) de una pared
 * o del borde de otro mueble/pilar, lo alinea. Se elige el ajuste más pequeño
 * en cada eje para que el imán se note natural y no "salte".
 */
export function snap(item: FurnitureItem, state: ProjectState, distance = SNAP_DISTANCE): SnapResult {
  const b = itemBox(item);
  const { room } = state;

  let bestX: { delta: number; label: string } | null = null;
  let bestY: { delta: number; label: string } | null = null;
  const considerX = (delta: number, label: string) => {
    if (Math.abs(delta) < distance && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, label };
  };
  const considerY = (delta: number, label: string) => {
    if (Math.abs(delta) < distance && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, label };
  };

  // Paredes
  considerX(0 - b.minX, 'pared izquierda');
  considerX(room.width - b.maxX, 'pared derecha');
  considerY(0 - b.minY, 'pared del fondo');
  considerY(room.depth - b.maxY, 'frente');

  // Otros muebles y pilares: solo si están "al lado" en el otro eje.
  for (const o of obstaclesFor(state, item.id)) {
    const ob = o.box;
    const label = o.kind === 'pillar' ? 'pilar' : 'mueble';
    if (intervalOverlap(b.minY, b.maxY, ob.minY, ob.maxY) > -distance) {
      considerX(ob.maxX - b.minX, label); // a su derecha
      considerX(ob.minX - b.maxX, label); // a su izquierda
      considerX(ob.minX - b.minX, label); // alinear lados izquierdos
      considerX(ob.maxX - b.maxX, label); // alinear lados derechos
    }
    if (intervalOverlap(b.minX, b.maxX, ob.minX, ob.maxX) > -distance) {
      considerY(ob.maxY - b.minY, label); // delante del obstáculo
      considerY(ob.minY - b.maxY, label); // detrás
      considerY(ob.minY - b.minY, label); // alinear traseras
      considerY(ob.maxY - b.maxY, label); // alinear frentes
    }
  }

  const sx = bestX as { delta: number; label: string } | null;
  const sy = bestY as { delta: number; label: string } | null;
  return {
    item: { ...item, x: item.x + (sx?.delta ?? 0), y: item.y + (sy?.delta ?? 0) },
    snappedX: sx?.label ?? null,
    snappedY: sy?.label ?? null,
  };
}

export interface MoveResult {
  item: FurnitureItem;
  snappedX: string | null;
  snappedY: string | null;
  /** true si se ha tenido que limitar el movimiento por una colisión. */
  blocked: boolean;
}

/**
 * Mueve un mueble hacia (x, y) respetando imanes y restricciones.
 * Si la posición choca, intenta deslizar en un solo eje (como en los
 * videojuegos, el objeto "resbala" a lo largo de la pared u obstáculo).
 */
export function resolveMove(
  state: ProjectState,
  current: FurnitureItem,
  x: number,
  y: number,
  useSnap = true,
): MoveResult {
  let candidate: FurnitureItem = { ...current, x, y };
  let snappedX: string | null = null;
  let snappedY: string | null = null;
  if (useSnap) {
    const s = snap(candidate, state);
    candidate = s.item;
    snappedX = s.snappedX;
    snappedY = s.snappedY;
  }
  candidate = clampToRoom(candidate, state.room);
  if (isValidPlacement(candidate, state)) return { item: candidate, snappedX, snappedY, blocked: false };

  const slideX = clampToRoom({ ...current, x: candidate.x }, state.room);
  if (isValidPlacement(slideX, state)) return { item: slideX, snappedX, snappedY: null, blocked: true };
  const slideY = clampToRoom({ ...current, y: candidate.y }, state.room);
  if (isValidPlacement(slideY, state)) return { item: slideY, snappedX: null, snappedY, blocked: true };

  return { item: current, snappedX: null, snappedY: null, blocked: true };
}

/** Eje de la habitación a lo largo del cual corre el ancho del mueble, si está a 0/90/180/270°. */
export function widthAxis(item: FurnitureItem): 'x' | 'y' | null {
  const r = normalizeDeg(Math.round(item.rotation));
  if (r % 180 === 0) return 'x';
  if (r % 90 === 0) return 'y';
  return null;
}

export interface Gap {
  axis: 'x' | 'y';
  /** Límites libres a cada lado (coordenada en el eje) y el obstáculo que los fija. */
  lowBound: number;
  highBound: number;
  lowLabel: string;
  highLabel: string;
  /** Hueco libre a cada lado del mueble (mm). */
  lowGap: number;
  highGap: number;
  /** Coordenada en el otro eje para dibujar la cota (centro del mueble). */
  cross: number;
}

/**
 * Calcula el hueco libre a ambos lados de un mueble en la dirección de su ancho,
 * hasta la pared, el pilar o el mueble más cercano.
 */
export function gapsAlongWidth(item: FurnitureItem, state: ProjectState): Gap | null {
  const axis = widthAxis(item);
  if (!axis) return null;
  const b = itemBox(item);
  const [aMin, aMax, cMin, cMax] = axis === 'x' ? [b.minX, b.maxX, b.minY, b.maxY] : [b.minY, b.maxY, b.minX, b.maxX];
  const roomMax = axis === 'x' ? state.room.width : state.room.depth;

  let lowBound = 0;
  let lowLabel = 'pared';
  let highBound = roomMax;
  let highLabel = axis === 'x' ? 'pared' : 'límite';

  for (const o of obstaclesFor(state, item.id)) {
    if (!sharesHeight(item, o)) continue;
    const ob = o.box;
    const [oMin, oMax, ocMin, ocMax] = axis === 'x' ? [ob.minX, ob.maxX, ob.minY, ob.maxY] : [ob.minY, ob.maxY, ob.minX, ob.maxX];
    if (intervalOverlap(cMin, cMax, ocMin, ocMax) <= 1) continue; // no está en la misma "línea"
    const label = o.kind === 'pillar' ? 'pilar' : 'mueble';
    if (oMax <= aMin + 0.5 && oMax > lowBound) {
      lowBound = oMax;
      lowLabel = label;
    }
    if (oMin >= aMax - 0.5 && oMin < highBound) {
      highBound = oMin;
      highLabel = label;
    }
  }

  return {
    axis,
    lowBound,
    highBound,
    lowLabel,
    highLabel,
    lowGap: aMin - lowBound,
    highGap: highBound - aMax,
    cross: (cMin + cMax) / 2,
  };
}

/**
 * "Ajuste a hueco": estira o encoge el ancho del mueble para ocupar el hueco
 * libre entre paredes, pilares y muebles vecinos (respetando el máximo del
 * catálogo). Si el hueco supera el máximo, lo pega al lado más bajo.
 */
export function fitToGap(item: FurnitureItem, state: ProjectState, maxWidth: number, minWidth: number): FurnitureItem | null {
  const gap = gapsAlongWidth(item, state);
  if (!gap) return null;
  const available = gap.highBound - gap.lowBound;
  if (available < minWidth) return null;
  const width = Math.floor(Math.min(available, maxWidth));
  const center = gap.lowBound + width / 2;
  const next: FurnitureItem = gap.axis === 'x' ? { ...item, width, x: center } : { ...item, width, y: center };
  return isValidPlacement(next, state) ? next : null;
}

/**
 * Busca una posición libre para un mueble nuevo: recorre la pared del fondo y,
 * si no cabe, va probando filas hacia el interior.
 */
export function findFreeSpot(item: FurnitureItem, state: ProjectState, step = 50): FurnitureItem | null {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  for (let y = hd; y <= state.room.depth - hd; y += step) {
    for (let x = hw; x <= state.room.width - hw; x += step) {
      const candidate = { ...item, x, y, rotation: 0 };
      if (isValidPlacement(candidate, state)) return candidate;
    }
  }
  return null;
}
