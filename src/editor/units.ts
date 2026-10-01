import type * as THREE from 'three';

/** El dominio trabaja en milímetros; la escena 3D en metros (1 unidad = 1 m). */
export const MM = 0.001;
export const DEG = Math.PI / 180;

/**
 * Capa 1 = elementos de ayuda (aristas, cotas, selección) que se dibujan
 * pero que el raycaster ignora al seleccionar.
 */
export const HELPER_LAYER = 1;

export function asHelper<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => o.layers.set(HELPER_LAYER));
  return obj;
}
