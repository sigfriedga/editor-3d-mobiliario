import { describe, expect, it } from 'vitest';
import { sampleCatalog } from '../src/domain/catalog';
import { BOARD, DOOR_GAP_BETWEEN, DOOR_GAP_EDGE, buildCutList, hingePositions } from '../src/domain/cutlist';
import { buildOrderPayload } from '../src/domain/order';
import { priceItem } from '../src/domain/pricing';
import { demoProject } from '../src/domain/store';
import type { FurnitureItem } from '../src/domain/types';

const item = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: 'a',
  typeId: 'bajo',
  x: 300,
  y: 290,
  rotation: 0,
  width: 800,
  height: 820,
  depth: 580,
  elevation: 0,
  finishId: 'nogal',
  doors: 2,
  shelves: 1,
  ...over,
});

describe('despiece paramétrico', () => {
  it('genera las piezas esperadas de un módulo bajo de 2 puertas', () => {
    const roles = buildCutList(item(), sampleCatalog).map((p) => p.role).sort();
    expect(roles).toEqual(['balda', 'lateral', 'lateral', 'puerta', 'puerta', 'suelo', 'techo', 'trasera', 'zocalo'].sort());
  });

  it('las puertas más sus holguras suman el ancho del mueble', () => {
    const doors = buildCutList(item(), sampleCatalog).filter((p) => p.role === 'puerta');
    const total = doors.reduce((s, d) => s + d.width, 0) + 2 * DOOR_GAP_EDGE + DOOR_GAP_BETWEEN;
    // El ancho de puerta es la cota menor (la mayor es el alto)
    expect(total).toBeCloseTo(800, 0);
  });

  it('suelo y techo encajan entre laterales', () => {
    const suelo = buildCutList(item(), sampleCatalog).find((p) => p.role === 'suelo')!;
    expect(suelo.length).toBe(800 - 2 * BOARD);
  });

  it('las puertas llevan cazoletas de bisagra según su altura', () => {
    expect(hingePositions(700)).toHaveLength(2);
    expect(hingePositions(1500)).toHaveLength(3);
    expect(hingePositions(2000)).toHaveLength(4);
  });

  it('una estantería abierta se fabrica entera en el acabado', () => {
    const panels = buildCutList(
      item({ typeId: 'estanteria', doors: 0, shelves: 4, height: 1800, depth: 350, finishId: 'verde-salvia' }),
      sampleCatalog,
    );
    expect(panels.filter((p) => p.role === 'lateral').every((p) => p.materialId === 'verde-salvia')).toBe(true);
    expect(panels.some((p) => p.role === 'puerta')).toBe(false);
  });
});

describe('precios', () => {
  it('un mueble más ancho cuesta más', () => {
    const narrow = priceItem(item({ width: 400 }), sampleCatalog).total;
    const wide = priceItem(item({ width: 1200 }), sampleCatalog).total;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('el acabado influye en el precio', () => {
    const cheap = priceItem(item({ finishId: 'roble-natural' }), sampleCatalog).total;
    const dear = priceItem(item({ finishId: 'blanco-mate' }), sampleCatalog).total;
    expect(dear).toBeGreaterThan(cheap);
  });

  it('la configuración exportada cuadra con el total', () => {
    const order = buildOrderPayload(demoProject(), sampleCatalog);
    const sum = order.modules.reduce((s, m) => s + m.price, 0);
    expect(order.totals.subtotal).toBeCloseTo(sum, 2);
    expect(order.units).toBe('mm');
  });
});
