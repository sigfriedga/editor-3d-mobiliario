import * as THREE from 'three';
import { buildCutList } from '../domain/cutlist';
import type { Catalog, FurnitureItem } from '../domain/types';
import type { MaterialLibrary } from './MaterialLibrary';
import { DEG, MM, asHelper } from './units';

const DOOR_OPEN_ANGLE = 100 * DEG;
const DOOR_SPEED = 3; // recorridos completos por segundo

/** Parámetros que obligan a regenerar la geometría (el resto solo mueve/gira). */
function geometryKey(i: FurnitureItem): string {
  return [i.typeId, i.width, i.height, i.depth, i.doors, i.shelves, i.finishId, i.elevation].join('|');
}

/**
 * Vista 3D de un mueble. Se construye a partir del DESPIECE (`buildCutList`),
 * de modo que cada tablero de la escena corresponde a una pieza fabricable.
 *
 * Jerarquía:
 *   root (posición y giro en la habitación)
 *    ├─ body (tableros; las puertas cuelgan de un "pivot" en el eje de la bisagra)
 *    ├─ selectionBox (aristas azules, solo si está seleccionado)
 *    └─ footprint (huella en el suelo, solo si está seleccionado)
 */
export class FurnitureView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private selectionBox: THREE.LineSegments | null = null;
  private footprint: THREE.Mesh | null = null;
  private doors: { pivot: THREE.Group; sign: number }[] = [];
  private openAmount = 0;
  private openTarget = 0;
  private key = '';
  private selected = false;
  item: FurnitureItem;

  constructor(
    item: FurnitureItem,
    private catalog: Catalog,
    private materials: MaterialLibrary,
  ) {
    this.item = item;
    this.root.userData.itemId = item.id;
    this.root.add(this.body);
    this.applyTransform();
    this.rebuild();
  }

  /** Aplica un nuevo estado del mueble. Solo regenera geometría si hace falta. */
  update(item: FurnitureItem) {
    if (item === this.item) return;
    this.item = item;
    this.applyTransform();
    if (geometryKey(item) !== this.key) this.rebuild();
  }

  private applyTransform() {
    const { x, y, elevation, rotation } = this.item;
    // Planta (x, y) → escena (x, z). La altura es el eje Y de Three.js.
    this.root.position.set(x * MM, elevation * MM, y * MM);
    this.root.rotation.y = rotation * DEG;
  }

  private rebuild() {
    this.disposeBody();
    this.key = geometryKey(this.item);
    this.doors = [];

    for (const panel of buildCutList(this.item, this.catalog)) {
      const [sx, sy, sz] = panel.size;
      const geometry = new THREE.BoxGeometry(sx * MM, sy * MM, sz * MM);
      const mesh = new THREE.Mesh(geometry, this.materials.get(panel.materialId));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = panel.name;
      mesh.userData.panelId = panel.id;
      mesh.add(asHelper(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), this.materials.edges)));

      const [cx, cy, cz] = panel.center;
      if (panel.hinge) {
        // La puerta gira alrededor de un eje vertical en el canto de la bisagra:
        // se crea un grupo "pivot" en ese eje y la puerta se desplaza dentro de él.
        const pivot = new THREE.Group();
        pivot.position.set(panel.hinge.x * MM, cy * MM, panel.hinge.z * MM);
        mesh.position.set((cx - panel.hinge.x) * MM, 0, (cz - panel.hinge.z) * MM);
        mesh.userData.isDoor = true;
        pivot.add(mesh);
        this.body.add(pivot);
        // Bisagra izquierda: giro negativo en Y para abrir hacia fuera (+Z).
        this.doors.push({ pivot, sign: panel.hinge.side === 'izquierda' ? -1 : 1 });
      } else {
        mesh.position.set(cx * MM, cy * MM, cz * MM);
        this.body.add(mesh);
      }
    }
    this.applyDoorAngle();
    this.buildSelectionHelpers();
  }

  private buildSelectionHelpers() {
    const { width: W, height: H, depth: D, elevation } = this.item;
    // Un poco más grande que el mueble para que sus aristas no coincidan con las del tablero.
    const m = 6;
    const box = new THREE.BoxGeometry((W + m) * MM, (H + m) * MM, (D + m) * MM);
    this.selectionBox = asHelper(new THREE.LineSegments(new THREE.EdgesGeometry(box), this.materials.selection));
    box.dispose();
    this.selectionBox.position.y = (H / 2) * MM;
    this.selectionBox.renderOrder = 10;

    const plane = new THREE.PlaneGeometry(W * MM, D * MM);
    plane.rotateX(-Math.PI / 2);
    this.footprint = asHelper(new THREE.Mesh(plane, this.materials.footprint));
    // Siempre sobre el suelo, aunque el mueble esté colgado.
    this.footprint.position.y = -elevation * MM + 0.002;

    this.root.add(this.selectionBox, this.footprint);
    this.setSelected(this.selected);
  }

  setSelected(selected: boolean) {
    this.selected = selected;
    if (this.selectionBox) this.selectionBox.visible = selected;
    if (this.footprint) this.footprint.visible = selected;
  }

  setOpen(open: boolean) {
    this.openTarget = open ? 1 : 0;
  }

  get hasDoors() {
    return this.doors.length > 0;
  }

  /** Avanza la animación de puertas. Devuelve true si sigue animando. */
  tick(dt: number): boolean {
    if (this.openAmount === this.openTarget) return false;
    const dir = Math.sign(this.openTarget - this.openAmount);
    this.openAmount = THREE.MathUtils.clamp(this.openAmount + dir * dt * DOOR_SPEED, 0, 1);
    if ((dir > 0 && this.openAmount > this.openTarget) || (dir < 0 && this.openAmount < this.openTarget)) {
      this.openAmount = this.openTarget;
    }
    this.applyDoorAngle();
    return true;
  }

  private applyDoorAngle() {
    // Curva suave (ease in-out) para que la apertura parezca natural.
    const t = this.openAmount;
    const eased = t * t * (3 - 2 * t);
    for (const d of this.doors) d.pivot.rotation.y = d.sign * eased * DOOR_OPEN_ANGLE;
  }

  private disposeBody() {
    // Liberar geometrías es imprescindible: la GPU no tiene recolector de basura.
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    });
    this.body.clear();
    for (const helper of [this.selectionBox, this.footprint]) {
      if (helper) {
        helper.geometry.dispose();
        this.root.remove(helper);
      }
    }
    this.selectionBox = null;
    this.footprint = null;
  }

  dispose() {
    this.disposeBody();
    this.root.removeFromParent();
  }
}
