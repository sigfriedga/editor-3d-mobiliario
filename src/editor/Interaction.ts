import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ProjectStore } from '../domain/store';
import { MM } from './units';

export interface PickResult {
  itemId: string;
  isDoor: boolean;
  point: THREE.Vector3;
}

interface DragState {
  itemId: string;
  plane: THREE.Plane;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  started: boolean;
}

/** Píxeles que hay que mover el ratón para que un clic se convierta en arrastre. */
const DRAG_THRESHOLD = 4;

/**
 * Interacción con el ratón y el teclado:
 * - clic: seleccionar (raycasting contra los muebles)
 * - arrastrar: mover sobre un plano horizontal, con imanes (Alt los desactiva)
 * - doble clic: abrir/cerrar puertas
 * - teclado: R girar, Supr eliminar, Ctrl+Z / Ctrl+Y deshacer/rehacer, Esc deseleccionar
 */
export class Interaction {
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private drag: DragState | null = null;
  private down: { x: number; y: number } | null = null;
  private abort = new AbortController();

  constructor(
    private dom: HTMLElement,
    private camera: THREE.Camera,
    private controls: OrbitControls,
    private store: ProjectStore,
    private pickables: () => THREE.Object3D[],
    private onStatus: (msg: string) => void,
  ) {
    const opts = { signal: this.abort.signal };
    // En fase de captura: así se ejecuta ANTES que OrbitControls y podemos
    // desactivar la cámara cuando el clic cae sobre un mueble.
    dom.addEventListener('pointerdown', this.onPointerDown, { ...opts, capture: true });
    dom.addEventListener('pointermove', this.onPointerMove, opts);
    dom.addEventListener('pointerup', this.onPointerUp, opts);
    dom.addEventListener('pointercancel', this.onPointerUp, opts);
    dom.addEventListener('dblclick', this.onDoubleClick, opts);
    window.addEventListener('keydown', this.onKeyDown, opts);
  }

  private setPointer(ev: PointerEvent | MouseEvent) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  pick(ev: PointerEvent | MouseEvent): PickResult | null {
    this.setPointer(ev);
    const hits = this.raycaster.intersectObjects(this.pickables(), true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      let isDoor = false;
      while (o) {
        if (o.userData.isDoor) isDoor = true;
        if (o.userData.itemId) return { itemId: o.userData.itemId as string, isDoor, point: hit.point };
        o = o.parent;
      }
    }
    return null;
  }

  private onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const hit = this.pick(ev);
    this.down = { x: ev.clientX, y: ev.clientY };
    if (!hit) return;

    this.store.select(hit.itemId);
    const item = this.store.getItem(hit.itemId);
    if (!item) return;
    // Arrastramos sobre un plano horizontal a la altura del punto agarrado:
    // así el mueble sigue al cursor sin "saltos", también los colgados.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
    this.drag = {
      itemId: hit.itemId,
      plane,
      offsetX: item.x - hit.point.x / MM,
      offsetY: item.y - hit.point.z / MM,
      startX: ev.clientX,
      startY: ev.clientY,
      started: false,
    };
    this.controls.enabled = false; // que la cámara no orbite mientras arrastramos
    this.dom.setPointerCapture(ev.pointerId);
  };

  private onPointerMove = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d) {
      this.dom.style.cursor = this.pick(ev) ? 'grab' : '';
      return;
    }
    if (!d.started) {
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.started = true;
      this.store.beginGesture();
      this.dom.style.cursor = 'grabbing';
    }
    this.setPointer(ev);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(d.plane, p)) return;
    const result = this.store.move(d.itemId, p.x / MM + d.offsetX, p.z / MM + d.offsetY, !ev.altKey);
    if (!result) return;
    const snaps = [result.snappedX, result.snappedY].filter(Boolean);
    this.onStatus(
      result.blocked
        ? 'Bloqueado: chocaría con otro elemento'
        : snaps.length
          ? `Imán: ${snaps.join(' · ')}  (Alt para desactivar)`
          : 'Moviendo… (Alt desactiva los imanes)',
    );
  };

  private onPointerUp = (ev: PointerEvent) => {
    const d = this.drag;
    if (d) {
      if (d.started) this.store.endGesture();
      this.drag = null;
      this.controls.enabled = true;
      this.dom.style.cursor = '';
      if (this.dom.hasPointerCapture(ev.pointerId)) this.dom.releasePointerCapture(ev.pointerId);
      this.onStatus('');
    } else if (this.down && Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y) < DRAG_THRESHOLD) {
      // Clic en vacío (sin orbitar): deseleccionar.
      this.store.select(null);
    }
    this.down = null;
  };

  private onDoubleClick = (ev: MouseEvent) => {
    const hit = this.pick(ev);
    if (hit) this.store.toggleDoors(hit.itemId);
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const id = this.store.selectedId;
    const key = ev.key.toLowerCase();

    if (mod && key === 'z' && !ev.shiftKey) {
      this.store.undo();
    } else if (mod && (key === 'y' || (key === 'z' && ev.shiftKey))) {
      this.store.redo();
    } else if (id && key === 'r' && !mod) {
      this.store.rotate(id, ev.shiftKey ? -90 : 90);
    } else if (id && (ev.key === 'Delete' || ev.key === 'Backspace')) {
      this.store.remove(id);
    } else if (ev.key === 'Escape') {
      this.store.select(null);
    } else {
      return;
    }
    ev.preventDefault();
  };

  dispose() {
    this.abort.abort();
  }
}
