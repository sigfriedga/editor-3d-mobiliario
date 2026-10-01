import { describe, expect, it } from 'vitest';
import { collisions, fitToGap, gapsAlongWidth, isValidPlacement, itemBox, resolveMove, snap } from '../src/domain/layout';
import type { FurnitureItem, ProjectState } from '../src/domain/types';

const base = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: 'a',
  typeId: 'bajo',
  x: 300,
  y: 290,
  rotation: 0,
  width: 600,
  height: 820,
  depth: 580,
  elevation: 0,
  finishId: 'roble-natural',
  doors: 1,
  shelves: 1,
  ...over,
});

const room = { width: 4000, depth: 3000, height: 2600, pillars: [{ id: 'p', x: 2000, y: 0, width: 300, depth: 300 }] };
const state = (items: FurnitureItem[]): ProjectState => ({ room, items });

describe('restricciones', () => {
  it('un mueble no puede salirse de la habitación', () => {
    const s = state([base()]);
    const r = resolveMove(s, base(), -500, 290);
    expect(itemBox(r.item).minX).toBeCloseTo(0);
  });

  it('no puede atravesar un pilar', () => {
    const s = state([base()]);
    expect(isValidPlacement(base({ x: 2100 }), s)).toBe(false);
    expect(collisions(base({ x: 2100 }), s)[0].kind).toBe('pillar');
  });

  it('un mueble alto colgado puede ir encima de uno bajo', () => {
    const bajo = base();
    const alto = base({ id: 'b', typeId: 'alto', depth: 350, y: 175, height: 720, elevation: 1450 });
    expect(isValidPlacement(alto, state([bajo, alto]))).toBe(true);
  });

  it('si el destino choca, el mueble resbala en el eje libre', () => {
    const a = base();
    const b = base({ id: 'b', x: 1500 });
    const s = state([a, b]);
    // Intento meter "b" encima de "a" y a la vez desplazarlo un poco hacia dentro:
    // el eje X está bloqueado, pero el movimiento en Y sí se aplica.
    const r = resolveMove(s, b, 600, 400, false);
    expect(r.blocked).toBe(true);
    expect(r.item.x).toBe(1500);
    expect(r.item.y).toBe(400);
    expect(isValidPlacement(r.item, s)).toBe(true);
  });
});

describe('imanes', () => {
  it('pega el mueble a la pared cuando está cerca', () => {
    const s = state([base({ x: 340 })]);
    const r = snap(base({ x: 340 }), s);
    expect(itemBox(r.item).minX).toBeCloseTo(0);
    expect(r.snappedX).toBe('pared izquierda');
  });

  it('pega un módulo al lado de otro', () => {
    const a = base();
    const b = base({ id: 'b', x: 940 }); // a 40 mm del primero
    const r = snap(b, state([a, b]));
    expect(itemBox(r.item).minX).toBeCloseTo(600);
  });
});

describe('ajuste a hueco (pilares)', () => {
  it('calcula el hueco entre la pared y el pilar', () => {
    const a = base({ x: 700 });
    const gap = gapsAlongWidth(a, state([a]))!;
    expect(gap.axis).toBe('x');
    expect(gap.lowGap).toBeCloseTo(400);
    expect(gap.highGap).toBeCloseTo(1000);
    expect(gap.highLabel).toBe('pilar');
  });

  it('ajusta el ancho hasta el pilar respetando el máximo del catálogo', () => {
    const a = base({ x: 300 });
    const b = base({ id: 'b', x: 1300, width: 600 }); // entre 1000 y 1600
    const s = state([a, b]);
    const fitted = fitToGap(b, s, 1200, 300)!;
    // Hueco libre: de 600 (módulo a) a 2000 (pilar) = 1400 → se limita a 1200
    expect(fitted.width).toBe(1200);
    expect(itemBox(fitted).minX).toBeCloseTo(600);
  });

  it('rellena un hueco exacto', () => {
    const a = base({ x: 300 });
    const c = base({ id: 'c', x: 1700, width: 600 }); // de 1400 a 2000 (pegado al pilar)
    const b = base({ id: 'b', x: 1000, width: 500 }); // hueco de 600 a 1400
    const fitted = fitToGap(b, state([a, b, c]), 1200, 300)!;
    expect(fitted.width).toBe(800);
  });
});
