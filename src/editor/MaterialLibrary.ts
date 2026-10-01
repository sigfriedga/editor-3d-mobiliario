import * as THREE from 'three';
import { getMaterial } from '../domain/catalog';
import type { Catalog } from '../domain/types';

/**
 * Caché de materiales compartidos. Crear un material por pieza dispararía el
 * número de programas/uniformes en GPU; compartirlos es una de las
 * optimizaciones más baratas y efectivas en escenas con muchos objetos.
 */
export class MaterialLibrary {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  // Las ayudas usan materiales OPACOS a propósito: en algunas GPU, mezclar
  // líneas transparentes junto a materiales PBR hacía desaparecer el mueble
  // seleccionado. Opaco + colores suaves da el mismo efecto sin ese riesgo.
  readonly edges = new THREE.LineBasicMaterial({ color: 0x8f8a82 });
  readonly selection = new THREE.LineBasicMaterial({ color: 0x2f6fed });
  readonly footprint = new THREE.MeshBasicMaterial({
    color: 0xc5d5f6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  constructor(private catalog: Catalog) {}

  get(materialId: string): THREE.MeshStandardMaterial {
    let mat = this.cache.get(materialId);
    if (!mat) {
      const def = getMaterial(this.catalog, materialId);
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.color),
        roughness: def.roughness,
        metalness: 0,
      });
      mat.name = def.id;
      this.cache.set(materialId, mat);
    }
    return mat;
  }

  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
    this.edges.dispose();
    this.selection.dispose();
    this.footprint.dispose();
  }
}
