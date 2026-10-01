/**
 * Tipos del modelo de dominio.
 *
 * Convenciones (importante para todo el proyecto):
 * - Todas las medidas del dominio están en MILÍMETROS (como en fábrica).
 * - Vista en planta: origen en la esquina trasera izquierda de la habitación,
 *   eje X hacia la derecha y eje Y hacia el interior de la habitación
 *   (alejándose de la pared del fondo).
 * - `rotation` está en grados alrededor del eje vertical. Se usa la misma
 *   convención que `Object3D.rotation.y` de Three.js para que la conversión
 *   sea directa (ver `geometry2d.ts`).
 * - El "frente" de un mueble (puertas) mira hacia +Y local; con rotación 0
 *   la trasera queda pegada a la pared del fondo.
 */

/** Familia de mueble del catálogo. */
export type FurnitureKind = 'bajo' | 'alto' | 'columna' | 'estanteria';

export interface Range {
  min: number;
  max: number;
  step: number;
}

/** Definición paramétrica de un tipo de mueble (viene del catálogo). */
export interface FurnitureType {
  id: string;
  kind: FurnitureKind;
  name: string;
  width: Range & { default: number };
  height: Range & { default: number };
  depth: Range & { default: number };
  /** Altura desde el suelo a la que se instala (muebles altos colgados). */
  elevation: number;
  /** Altura del zócalo en mm (0 si no tiene). */
  plinth: number;
  doors: { min: number; max: number; default: number };
  shelves: { min: number; max: number; default: number };
  /** Si es true, el cuerpo se fabrica en el acabado elegido (p. ej. estanterías vistas). */
  carcassUsesFinish: boolean;
}

/** Material de tablero con su precio. */
export interface Material {
  id: string;
  name: string;
  /** Precio por metro cuadrado de tablero, sin IVA. */
  pricePerM2: number;
  /** Color para la vista 3D (hex CSS). */
  color: string;
  roughness: number;
  thickness: number;
}

export interface Hardware {
  hingePrice: number;
  shelfSupportPrice: number;
  edgeBandingPerMeter: number;
  assemblyPerModule: number;
}

export interface Catalog {
  version: string;
  currency: 'EUR';
  types: FurnitureType[];
  /** Acabados elegibles por el usuario (puertas, zócalo, estanterías vistas). */
  finishes: Material[];
  /** Material del cuerpo cuando no lleva acabado. */
  carcassMaterialId: string;
  /** Material de la trasera. */
  backMaterialId: string;
  /** Todos los materiales (incluye cuerpo y trasera). */
  materials: Material[];
  hardware: Hardware;
}

/** Un mueble colocado en el proyecto. Inmutable: cada cambio crea un objeto nuevo. */
export interface FurnitureItem {
  id: string;
  typeId: string;
  /** Centro de la huella en planta (mm). */
  x: number;
  y: number;
  /** Grados alrededor del eje vertical. */
  rotation: number;
  width: number;
  height: number;
  depth: number;
  elevation: number;
  finishId: string;
  doors: number;
  shelves: number;
}

/** Obstáculo rectangular alineado a ejes (pilares). */
export interface Pillar {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Room {
  width: number;
  depth: number;
  height: number;
  pillars: Pillar[];
}

export interface ProjectState {
  room: Room;
  items: FurnitureItem[];
}
