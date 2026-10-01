import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Gap } from '../domain/layout';
import type { FurnitureItem } from '../domain/types';
import { DEG, MM, asHelper } from './units';

const OFFSET = 0.09; // separación de la cota respecto al mueble (m)
const TICK = 0.035;

/**
 * Cotas del mueble seleccionado: ancho, alto, fondo, altura de colocación
 * y huecos libres hasta pared/pilar/vecino. Las líneas son geometría 3D y
 * los textos son etiquetas HTML (CSS2DRenderer), que siempre se leen nítidas.
 */
export class DimensionsView {
  readonly group = new THREE.Group();
  private lineMat = new THREE.LineBasicMaterial({ color: 0x1f2328 });
  private gapMat = new THREE.LineBasicMaterial({ color: 0xd9480f });

  show(item: FurnitureItem | null, gap: Gap | null) {
    this.clear();
    if (!item) return;
    const W = item.width * MM;
    const H = item.height * MM;
    const D = item.depth * MM;
    const e = item.elevation * MM;

    // Cotas locales: van en un grupo con la misma posición/giro que el mueble.
    const local = new THREE.Group();
    local.position.set(item.x * MM, e, item.y * MM);
    local.rotation.y = item.rotation * DEG;
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3(1, 0, 0);
    local.add(
      this.dimension(new THREE.Vector3(-W / 2, H + OFFSET, D / 2), new THREE.Vector3(W / 2, H + OFFSET, D / 2), item.width, up, this.lineMat),
      this.dimension(new THREE.Vector3(W / 2 + OFFSET, 0, D / 2), new THREE.Vector3(W / 2 + OFFSET, H, D / 2), item.height, side, this.lineMat),
      this.dimension(new THREE.Vector3(W / 2, H + OFFSET, -D / 2), new THREE.Vector3(W / 2, H + OFFSET, D / 2), item.depth, up, this.lineMat),
    );
    if (item.elevation > 0) {
      local.add(
        this.dimension(new THREE.Vector3(-W / 2 - OFFSET, -e, D / 2), new THREE.Vector3(-W / 2 - OFFSET, 0, D / 2), item.elevation, side, this.lineMat, '↥ '),
      );
    }
    this.group.add(local);

    // Huecos hasta lo que haya a cada lado (en coordenadas de la habitación, a ras de suelo).
    if (gap) {
      const y = 0.012;
      const at = (along: number, cross: number) =>
        gap.axis === 'x' ? new THREE.Vector3(along * MM, y, cross * MM) : new THREE.Vector3(cross * MM, y, along * MM);
      const tickDir = gap.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const aMin = gap.lowBound + gap.lowGap;
      const aMax = gap.highBound - gap.highGap;
      if (gap.lowGap > 1) {
        this.group.add(this.dimension(at(gap.lowBound, gap.cross), at(aMin, gap.cross), gap.lowGap, tickDir, this.gapMat, '', true));
      }
      if (gap.highGap > 1) {
        this.group.add(this.dimension(at(aMax, gap.cross), at(gap.highBound, gap.cross), gap.highGap, tickDir, this.gapMat, '', true));
      }
    }
    asHelper(this.group);
  }

  private dimension(
    a: THREE.Vector3,
    b: THREE.Vector3,
    valueMm: number,
    tickDir: THREE.Vector3,
    material: THREE.LineBasicMaterial,
    prefix = '',
    isGap = false,
  ): THREE.Group {
    const g = new THREE.Group();
    const t = tickDir.clone().multiplyScalar(TICK);
    const pts = [
      a, b,
      a.clone().sub(t), a.clone().add(t),
      b.clone().sub(t), b.clone().add(t),
    ];
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), material);
    line.renderOrder = 20;
    g.add(line);

    const el = document.createElement('div');
    el.className = isGap ? 'cota cota--hueco' : 'cota';
    el.textContent = `${prefix}${Math.round(valueMm)}`;
    const label = new CSS2DObject(el);
    label.position.copy(a).add(b).multiplyScalar(0.5);
    g.add(label);
    return g;
  }

  clear() {
    this.group.traverse((o) => {
      if (o instanceof THREE.LineSegments) o.geometry.dispose();
      // Las etiquetas están anidadas: hay que quitar su elemento HTML a mano.
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.lineMat.dispose();
    this.gapMat.dispose();
    this.group.removeFromParent();
  }
}
