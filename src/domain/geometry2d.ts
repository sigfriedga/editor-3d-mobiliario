/**
 * Geometría 2D en planta: huellas de los muebles, cajas envolventes y
 * detección de colisiones con el Teorema del Eje Separador (SAT).
 */
import type { FurnitureItem, Pillar } from './types';

export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const DEG = Math.PI / 180;

/**
 * Pasa un punto del sistema local del mueble al sistema de la habitación.
 * Es la misma rotación que aplica Three.js con `rotation.y` sobre el plano XZ
 * (nuestro Y de planta corresponde al Z de Three.js).
 */
export function localToWorld(local: Vec2, origin: Vec2, rotationDeg: number): Vec2 {
  const a = rotationDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: origin.x + local.x * c + local.y * s,
    y: origin.y - local.x * s + local.y * c,
  };
}

/** Cuatro esquinas de la huella de un mueble, en orden. */
export function footprint(item: Pick<FurnitureItem, 'x' | 'y' | 'rotation' | 'width' | 'depth'>): Vec2[] {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const corners: Vec2[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return corners.map((p) => localToWorld(p, item, item.rotation));
}

export function pillarPolygon(p: Pillar): Vec2[] {
  return [
    { x: p.x, y: p.y },
    { x: p.x + p.width, y: p.y },
    { x: p.x + p.width, y: p.y + p.depth },
    { x: p.x, y: p.y + p.depth },
  ];
}

export function aabbOf(points: Vec2[]): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function project(poly: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * axis.x + p.y * axis.y;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

/**
 * Indica si dos polígonos convexos se solapan (SAT).
 * `tolerance` (mm) permite que dos muebles se toquen sin considerarse colisión,
 * algo imprescindible para poder poner módulos uno junto a otro.
 */
export function convexOverlap(a: Vec2[], b: Vec2[], tolerance = 0.5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len === 0) continue;
      // Normal de la arista: candidato a eje separador.
      const axis = { x: -(p2.y - p1.y) / len, y: (p2.x - p1.x) / len };
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      const penetration = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (penetration <= tolerance) return false; // hay un eje que los separa
    }
  }
  return true;
}

/** Solape de dos intervalos 1D (longitud positiva si se solapan). */
export function intervalOverlap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin);
}

/** Normaliza un ángulo en grados a [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
