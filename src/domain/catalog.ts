import type { Catalog, FurnitureType, Material } from './types';

/**
 * Catálogo de EJEMPLO. Los precios son inventados y solo sirven para mostrar
 * el flujo configuración → despiece → precio. En un caso real este JSON
 * llegaría de la API de catálogo (ver `src/api/catalogApi.ts`).
 */
export const sampleCatalog: Catalog = {
  version: '2026.10-demo',
  currency: 'EUR',
  types: [
    {
      id: 'bajo',
      kind: 'bajo',
      name: 'Módulo bajo',
      width: { min: 300, max: 1200, step: 10, default: 600 },
      height: { min: 700, max: 950, step: 10, default: 820 },
      depth: { min: 300, max: 650, step: 10, default: 580 },
      elevation: 0,
      plinth: 100,
      doors: { min: 0, max: 2, default: 1 },
      shelves: { min: 0, max: 2, default: 1 },
      carcassUsesFinish: false,
    },
    {
      id: 'alto',
      kind: 'alto',
      name: 'Módulo alto (colgado)',
      width: { min: 300, max: 1200, step: 10, default: 600 },
      height: { min: 400, max: 960, step: 10, default: 720 },
      depth: { min: 250, max: 400, step: 10, default: 350 },
      elevation: 1450,
      plinth: 0,
      doors: { min: 0, max: 2, default: 2 },
      shelves: { min: 0, max: 3, default: 1 },
      carcassUsesFinish: false,
    },
    {
      id: 'columna',
      kind: 'columna',
      name: 'Columna / armario',
      width: { min: 400, max: 1000, step: 10, default: 600 },
      height: { min: 1800, max: 2400, step: 10, default: 2150 },
      depth: { min: 350, max: 650, step: 10, default: 600 },
      elevation: 0,
      plinth: 100,
      doors: { min: 0, max: 2, default: 2 },
      shelves: { min: 0, max: 6, default: 4 },
      carcassUsesFinish: false,
    },
    {
      id: 'estanteria',
      kind: 'estanteria',
      name: 'Estantería abierta',
      width: { min: 400, max: 1200, step: 10, default: 800 },
      height: { min: 600, max: 2400, step: 10, default: 1800 },
      depth: { min: 250, max: 450, step: 10, default: 350 },
      elevation: 0,
      plinth: 0,
      doors: { min: 0, max: 0, default: 0 },
      shelves: { min: 1, max: 7, default: 4 },
      carcassUsesFinish: true,
    },
  ],
  finishes: [],
  carcassMaterialId: 'melamina-blanca',
  backMaterialId: 'hdf-blanco',
  materials: [
    { id: 'melamina-blanca', name: 'Melamina blanca', pricePerM2: 14, color: '#f2f1ee', roughness: 0.6, thickness: 19 },
    { id: 'hdf-blanco', name: 'HDF blanco 3 mm', pricePerM2: 6, color: '#ecebe8', roughness: 0.7, thickness: 3 },
    { id: 'roble-natural', name: 'Roble natural', pricePerM2: 38, color: '#c49a6c', roughness: 0.55, thickness: 19 },
    { id: 'nogal', name: 'Nogal', pricePerM2: 42, color: '#6e4a33', roughness: 0.5, thickness: 19 },
    { id: 'blanco-mate', name: 'Lacado blanco mate', pricePerM2: 55, color: '#fafaf7', roughness: 0.85, thickness: 19 },
    { id: 'gris-antracita', name: 'Gris antracita', pricePerM2: 46, color: '#3d4045', roughness: 0.7, thickness: 19 },
    { id: 'verde-salvia', name: 'Verde salvia', pricePerM2: 52, color: '#9aab8f', roughness: 0.8, thickness: 19 },
  ],
  hardware: {
    hingePrice: 4.5,
    shelfSupportPrice: 0.35,
    edgeBandingPerMeter: 1.2,
    assemblyPerModule: 25,
  },
};
sampleCatalog.finishes = sampleCatalog.materials.filter((m) =>
  ['roble-natural', 'nogal', 'blanco-mate', 'gris-antracita', 'verde-salvia'].includes(m.id),
);

export function getType(catalog: Catalog, typeId: string): FurnitureType {
  const t = catalog.types.find((x) => x.id === typeId);
  if (!t) throw new Error(`Tipo de mueble desconocido: ${typeId}`);
  return t;
}

export function getMaterial(catalog: Catalog, id: string): Material {
  const m = catalog.materials.find((x) => x.id === id);
  if (!m) throw new Error(`Material desconocido: ${id}`);
  return m;
}

/** Ajusta un valor a un rango con paso (p. ej. anchos de 10 en 10 mm). */
export function clampToRange(value: number, r: { min: number; max: number; step?: number }): number {
  const step = r.step ?? 1;
  const snapped = Math.round(value / step) * step;
  return Math.min(r.max, Math.max(r.min, snapped));
}
