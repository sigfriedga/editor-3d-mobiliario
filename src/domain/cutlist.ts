/**
 * Modelo paramétrico → despiece.
 *
 * Esta es la pieza central del diseño: a partir de los parámetros de un mueble
 * (ancho, alto, fondo, puertas, baldas, acabado) se generan sus PIEZAS reales,
 * cada una con su colocación en 3D y sus mecanizados.
 *
 * La vista 3D se construye a partir de este mismo despiece, así que lo que el
 * usuario ve es exactamente lo que se fabricaría (una única fuente de verdad).
 */
import { getMaterial, getType } from './catalog';
import type { Catalog, FurnitureItem } from './types';

/** Grosor estándar de tablero (mm). */
export const BOARD = 19;
/** Holgura perimetral y entre puertas (mm). */
export const DOOR_GAP_EDGE = 2;
export const DOOR_GAP_BETWEEN = 3;
/** Retranqueo del zócalo respecto al frente (mm). */
export const PLINTH_SETBACK = 50;

export type PanelRole = 'lateral' | 'suelo' | 'techo' | 'trasera' | 'balda' | 'puerta' | 'zocalo';

/**
 * Mecanizado sobre una cara de la pieza. Coordenadas en mm sobre la cara
 * (x a lo largo del largo, y a lo largo del ancho).
 *
 * NOTA: formato ilustrativo. El formato real de intercambio de geometría y
 * mecanizados se definiría con el especialista CAD/CAM (p. ej. para generar
 * programas MPR o similares).
 */
export interface Operation {
  type: 'taladro';
  face: 'A' | 'B';
  x: number;
  y: number;
  diameter: number;
  depth: number;
  purpose: string;
}

export interface Panel {
  id: string;
  role: PanelRole;
  name: string;
  materialId: string;
  /** Medidas de corte: largo ≥ ancho, y grueso. */
  length: number;
  width: number;
  thickness: number;
  /** Metros lineales de canto aplicados. */
  edgeBandingM: number;
  operations: Operation[];
  /**
   * Colocación en el sistema local del mueble (mm): origen en el centro de la
   * huella a nivel del suelo del mueble, X = ancho, Y = altura, Z = fondo
   * (frente hacia +Z). `size` son las dimensiones de la caja en esos ejes.
   */
  center: [number, number, number];
  size: [number, number, number];
  /** Solo puertas: lado de la bisagra y eje de giro (x local). */
  hinge?: { side: 'izquierda' | 'derecha'; x: number; z: number };
}

function panel(
  p: Omit<Panel, 'length' | 'width' | 'thickness'> & { size: [number, number, number] },
): Panel {
  const dims = [...p.size].sort((a, b) => b - a);
  return { ...p, length: round(dims[0]), width: round(dims[1]), thickness: round(dims[2]) };
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Cazoletas de bisagra: Ø35 a 22,5 mm del canto, a 100 mm de los extremos. */
export function hingePositions(doorHeight: number): number[] {
  const ys = [100, doorHeight - 100];
  if (doorHeight > 1200) ys.splice(1, 0, doorHeight / 2);
  if (doorHeight > 1900) ys.splice(1, 1, doorHeight / 3, (doorHeight * 2) / 3);
  return ys.map(round);
}

export function buildCutList(item: FurnitureItem, catalog: Catalog): Panel[] {
  const type = getType(catalog, item.typeId);
  const W = item.width;
  const H = item.height;
  const D = item.depth;
  const t = BOARD;
  const p = type.plinth;
  const back = getMaterial(catalog, catalog.backMaterialId);
  const bt = back.thickness;
  const carcassMat = type.carcassUsesFinish ? item.finishId : catalog.carcassMaterialId;

  const hasDoors = item.doors > 0;
  // Si lleva puertas, el fondo total incluye el grueso de la puerta.
  const Dc = hasDoors ? D - t : D;
  const Hc = H - p; // altura del cuerpo (sin zócalo)
  const zBack = -D / 2;
  const zCarcassCenter = zBack + Dc / 2;
  const innerW = W - 2 * t;

  const panels: Panel[] = [];

  // Laterales (con taladros para soportes de balda, sistema 32 simplificado)
  const shelfHeights: number[] = [];
  const innerBottom = p + t;
  const innerTop = H - t;
  for (let i = 0; i < item.shelves; i++) {
    shelfHeights.push(innerBottom + ((i + 1) * (innerTop - innerBottom)) / (item.shelves + 1));
  }
  for (const side of ['izquierdo', 'derecho'] as const) {
    const x = side === 'izquierdo' ? -W / 2 + t / 2 : W / 2 - t / 2;
    const ops: Operation[] = [];
    for (const sh of shelfHeights) {
      const yOnPanel = round(sh - p - t / 2 - 8); // justo debajo de la balda
      ops.push(
        { type: 'taladro', face: 'A', x: yOnPanel, y: 37, diameter: 5, depth: 12, purpose: 'soporte de balda' },
        { type: 'taladro', face: 'A', x: yOnPanel, y: round(Dc - 37), diameter: 5, depth: 12, purpose: 'soporte de balda' },
      );
    }
    panels.push(
      panel({
        id: `lateral-${side}`,
        role: 'lateral',
        name: `Lateral ${side}`,
        materialId: carcassMat,
        size: [t, Hc, Dc],
        center: [x, p + Hc / 2, zCarcassCenter],
        edgeBandingM: Hc / 1000,
        operations: ops,
      }),
    );
  }

  // Suelo y techo entre laterales (dejan sitio a la trasera)
  const horizDepth = Dc - bt;
  const zHoriz = zBack + bt + horizDepth / 2;
  panels.push(
    panel({
      id: 'suelo',
      role: 'suelo',
      name: 'Suelo',
      materialId: carcassMat,
      size: [innerW, t, horizDepth],
      center: [0, p + t / 2, zHoriz],
      edgeBandingM: innerW / 1000,
      operations: [],
    }),
    panel({
      id: 'techo',
      role: 'techo',
      name: 'Techo',
      materialId: carcassMat,
      size: [innerW, t, horizDepth],
      center: [0, H - t / 2, zHoriz],
      edgeBandingM: innerW / 1000,
      operations: [],
    }),
  );

  // Trasera
  panels.push(
    panel({
      id: 'trasera',
      role: 'trasera',
      name: 'Trasera',
      materialId: back.id,
      size: [innerW, Hc - 2 * t, bt],
      center: [0, p + Hc / 2, zBack + bt / 2],
      edgeBandingM: 0,
      operations: [],
    }),
  );

  // Baldas (2 mm de holgura y 20 mm retranqueadas respecto al frente del cuerpo)
  const shelfW = innerW - 2;
  const shelfD = horizDepth - 20;
  shelfHeights.forEach((y, i) => {
    panels.push(
      panel({
        id: `balda-${i + 1}`,
        role: 'balda',
        name: `Balda ${i + 1}`,
        materialId: carcassMat,
        size: [shelfW, t, shelfD],
        center: [0, y, zBack + bt + shelfD / 2],
        edgeBandingM: shelfW / 1000,
        operations: [],
      }),
    );
  });

  // Zócalo
  if (p > 0) {
    const zt = 16;
    panels.push(
      panel({
        id: 'zocalo',
        role: 'zocalo',
        name: 'Zócalo',
        materialId: item.finishId,
        size: [W, p, zt],
        center: [0, p / 2, D / 2 - PLINTH_SETBACK - zt / 2],
        edgeBandingM: W / 1000,
        operations: [],
      }),
    );
  }

  // Puertas
  if (hasDoors) {
    const n = item.doors;
    const dw = (W - 2 * DOOR_GAP_EDGE - (n - 1) * DOOR_GAP_BETWEEN) / n;
    const dh = Hc - 2 * DOOR_GAP_EDGE;
    for (let i = 0; i < n; i++) {
      const left = -W / 2 + DOOR_GAP_EDGE + i * (dw + DOOR_GAP_BETWEEN);
      const side: 'izquierda' | 'derecha' = n === 1 || i === 0 ? 'izquierda' : 'derecha';
      const hingeX = side === 'izquierda' ? left : left + dw;
      const ops: Operation[] = hingePositions(dh).map((y) => ({
        type: 'taladro' as const,
        face: 'B' as const,
        x: y,
        y: 22.5,
        diameter: 35,
        depth: 13,
        purpose: `cazoleta bisagra (${side})`,
      }));
      panels.push(
        panel({
          id: `puerta-${i + 1}`,
          role: 'puerta',
          name: n === 1 ? 'Puerta' : `Puerta ${i + 1}`,
          materialId: item.finishId,
          size: [dw, dh, t],
          center: [left + dw / 2, p + Hc / 2, D / 2 - t / 2],
          edgeBandingM: (2 * (dw + dh)) / 1000,
          operations: ops,
          hinge: { side, x: hingeX, z: D / 2 - t },
        }),
      );
    }
  }

  return panels;
}

/** Superficie de una pieza en m². */
export function panelArea(p: Panel): number {
  return (p.length * p.width) / 1_000_000;
}

export function hingeCount(panels: Panel[]): number {
  return panels.filter((p) => p.role === 'puerta').reduce((n, p) => n + p.operations.length, 0);
}
