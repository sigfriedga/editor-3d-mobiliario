/**
 * Estado del proyecto + historial (deshacer/rehacer) + selección.
 *
 * Es la única fuente de verdad. El editor 3D y la interfaz Vue se suscriben
 * a sus eventos; ninguno de los dos guarda una copia propia del modelo.
 * El estado es inmutable: cada cambio produce objetos nuevos, de modo que
 * detectar qué ha cambiado es comparar referencias (barato y fiable).
 */
import { clampToRange, getType } from './catalog';
import { clampToRoom, findFreeSpot, fitToGap, isValidPlacement, resolveMove, type MoveResult } from './layout';
import { normalizeDeg } from './geometry2d';
import type { Catalog, FurnitureItem, ProjectState } from './types';

type Events = {
  change: ProjectState;
  selection: string | null;
  view: void;
  message: string;
};
type Listener<T> = (payload: T) => void;

const HISTORY_LIMIT = 100;

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

export class ProjectStore {
  private _state: ProjectState;
  private _selectedId: string | null = null;
  private undoStack: ProjectState[] = [];
  private redoStack: ProjectState[] = [];
  /** Estado al empezar un gesto (arrastre), para que cuente como un solo paso del historial. */
  private gestureStart: ProjectState | null = null;
  private openDoors = new Set<string>();
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  constructor(
    public readonly catalog: Catalog,
    initial: ProjectState,
  ) {
    this._state = initial;
  }

  // ---------- Eventos ----------
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event) as Set<Listener<Events[K]>> | undefined;
    if (!set) {
      set = new Set();
      this.listeners.set(event, set as Set<Listener<never>>);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }
  private emit<K extends keyof Events>(event: K, payload: Events[K]) {
    (this.listeners.get(event) as Set<Listener<Events[K]>> | undefined)?.forEach((fn) => fn(payload));
  }

  // ---------- Lectura ----------
  get state(): ProjectState {
    return this._state;
  }
  get selectedId(): string | null {
    return this._selectedId;
  }
  get selected(): FurnitureItem | null {
    return this.getItem(this._selectedId);
  }
  getItem(id: string | null): FurnitureItem | null {
    return id ? (this._state.items.find((i) => i.id === id) ?? null) : null;
  }
  isOpen(id: string): boolean {
    return this.openDoors.has(id);
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ---------- Historial ----------
  private commit(next: ProjectState) {
    if (next === this._state) return;
    if (!this.gestureStart) {
      this.undoStack.push(this._state);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this._state = next;
    this.emit('change', next);
  }

  beginGesture() {
    this.gestureStart = this._state;
  }

  endGesture() {
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start && start !== this._state) {
      this.undoStack.push(start);
      this.redoStack = [];
      this.emit('change', this._state);
    }
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this._state);
    this._state = prev;
    this.fixSelection();
    this.emit('change', prev);
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this._state);
    this._state = next;
    this.fixSelection();
    this.emit('change', next);
  }

  private fixSelection() {
    if (this._selectedId && !this.getItem(this._selectedId)) this.select(null);
  }

  private replaceItem(next: FurnitureItem) {
    this.commit({ ...this._state, items: this._state.items.map((i) => (i.id === next.id ? next : i)) });
  }

  // ---------- Acciones ----------
  select(id: string | null) {
    if (id === this._selectedId) return;
    this._selectedId = id;
    this.emit('selection', id);
  }

  addItem(typeId: string): FurnitureItem | null {
    const type = getType(this.catalog, typeId);
    const draft: FurnitureItem = {
      id: newId(),
      typeId,
      x: 0,
      y: 0,
      rotation: 0,
      width: type.width.default,
      height: type.height.default,
      depth: type.depth.default,
      elevation: type.elevation,
      finishId: this.catalog.finishes[0].id,
      doors: type.doors.default,
      shelves: type.shelves.default,
    };
    const placed = findFreeSpot(draft, this._state);
    if (!placed) {
      this.emit('message', 'No hay espacio libre para este mueble.');
      return null;
    }
    this.commit({ ...this._state, items: [...this._state.items, placed] });
    this.select(placed.id);
    return placed;
  }

  duplicate(id: string): FurnitureItem | null {
    const src = this.getItem(id);
    if (!src) return null;
    const placed = findFreeSpot({ ...src, id: newId() }, this._state);
    if (!placed) {
      this.emit('message', 'No hay espacio libre para duplicar.');
      return null;
    }
    this.commit({ ...this._state, items: [...this._state.items, placed] });
    this.select(placed.id);
    return placed;
  }

  remove(id: string) {
    if (!this.getItem(id)) return;
    this.openDoors.delete(id);
    if (this._selectedId === id) this.select(null);
    this.commit({ ...this._state, items: this._state.items.filter((i) => i.id !== id) });
  }

  /** Mueve con imanes y restricciones. Devuelve el resultado para dar feedback. */
  move(id: string, x: number, y: number, useSnap = true): MoveResult | null {
    const item = this.getItem(id);
    if (!item) return null;
    const result = resolveMove(this._state, item, x, y, useSnap);
    if (result.item !== item) this.replaceItem(result.item);
    return result;
  }

  rotate(id: string, deltaDeg: number): boolean {
    const item = this.getItem(id);
    if (!item) return false;
    const rotated = clampToRoom({ ...item, rotation: normalizeDeg(item.rotation + deltaDeg) }, this._state.room);
    if (!isValidPlacement(rotated, this._state)) {
      this.emit('message', 'No se puede girar: chocaría con otro elemento.');
      return false;
    }
    this.replaceItem(rotated);
    return true;
  }

  /** Cambia parámetros (medidas, acabado, puertas, baldas) validando contra el catálogo. */
  update(id: string, patch: Partial<Omit<FurnitureItem, 'id' | 'typeId'>>): boolean {
    const item = this.getItem(id);
    if (!item) return false;
    const type = getType(this.catalog, item.typeId);
    const next: FurnitureItem = { ...item, ...patch };
    next.width = clampToRange(next.width, type.width);
    next.height = clampToRange(next.height, type.height);
    next.depth = clampToRange(next.depth, type.depth);
    next.doors = clampToRange(next.doors, type.doors);
    next.shelves = clampToRange(next.shelves, type.shelves);
    next.elevation = Math.max(0, Math.round(next.elevation));
    if (next.doors === 0) this.openDoors.delete(id);

    // Al cambiar el ancho se mantiene fijo el lado izquierdo (como en un CAD):
    // así un módulo pegado a la pared sigue pegado.
    if (patch.width !== undefined && patch.x === undefined && patch.y === undefined) {
      const dw = next.width - item.width;
      const a = (item.rotation * Math.PI) / 180;
      next.x = item.x + (dw / 2) * Math.cos(a);
      next.y = item.y - (dw / 2) * Math.sin(a);
    }
    // Y al cambiar el fondo se mantiene la trasera contra la pared.
    if (patch.depth !== undefined && patch.x === undefined && patch.y === undefined) {
      const dd = next.depth - item.depth;
      const a = (item.rotation * Math.PI) / 180;
      next.x += (dd / 2) * Math.sin(a);
      next.y += (dd / 2) * Math.cos(a);
    }

    if (!isValidPlacement(next, this._state)) {
      this.emit('message', 'Ese cambio no cabe: chocaría con una pared, un pilar u otro mueble.');
      return false;
    }
    this.replaceItem(next);
    return true;
  }

  /** Ajusta el ancho al hueco libre (paredes, pilares y muebles vecinos). */
  fitToGap(id: string): boolean {
    const item = this.getItem(id);
    if (!item) return false;
    const type = getType(this.catalog, item.typeId);
    const next = fitToGap(item, this._state, type.width.max, type.width.min);
    if (!next) {
      this.emit('message', 'No se puede ajustar: gira el mueble a 0°/90° o deja un hueco mayor que el ancho mínimo.');
      return false;
    }
    this.replaceItem(next);
    return true;
  }

  toggleDoors(id: string) {
    const item = this.getItem(id);
    if (!item || item.doors === 0) return;
    if (this.openDoors.has(id)) this.openDoors.delete(id);
    else this.openDoors.add(id);
    this.emit('view', undefined);
  }

  toJSON(): ProjectState {
    return this._state;
  }
}

/** Proyecto inicial de ejemplo: cocina con un pilar en la pared del fondo. */
export function demoProject(): ProjectState {
  return {
    room: {
      width: 4200,
      depth: 3200,
      height: 2600,
      pillars: [{ id: 'pilar-1', x: 2600, y: 0, width: 350, depth: 350 }],
    },
    items: [
      { id: 'demo-1', typeId: 'columna', x: 300, y: 300, rotation: 0, width: 600, height: 2150, depth: 600, elevation: 0, finishId: 'roble-natural', doors: 2, shelves: 4 },
      { id: 'demo-2', typeId: 'bajo', x: 900, y: 290, rotation: 0, width: 600, height: 820, depth: 580, elevation: 0, finishId: 'roble-natural', doors: 1, shelves: 1 },
      { id: 'demo-3', typeId: 'alto', x: 900, y: 175, rotation: 0, width: 600, height: 720, depth: 350, elevation: 1450, finishId: 'blanco-mate', doors: 2, shelves: 1 },
      { id: 'demo-4', typeId: 'bajo', x: 3575, y: 290, rotation: 0, width: 800, height: 820, depth: 580, elevation: 0, finishId: 'roble-natural', doors: 2, shelves: 1 },
    ],
  };
}
