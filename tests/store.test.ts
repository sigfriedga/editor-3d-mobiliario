import { describe, expect, it } from 'vitest';
import { sampleCatalog } from '../src/domain/catalog';
import { itemBox } from '../src/domain/layout';
import { ProjectStore, demoProject } from '../src/domain/store';

const make = () => new ProjectStore(sampleCatalog, demoProject());

describe('ProjectStore', () => {
  it('añade un mueble en un hueco libre y lo selecciona', () => {
    const s = make();
    const added = s.addItem('bajo')!;
    expect(s.state.items).toHaveLength(5);
    expect(s.selectedId).toBe(added.id);
  });

  it('deshacer y rehacer', () => {
    const s = make();
    s.update('demo-2', { finishId: 'nogal' });
    expect(s.getItem('demo-2')!.finishId).toBe('nogal');
    s.undo();
    expect(s.getItem('demo-2')!.finishId).toBe('roble-natural');
    s.redo();
    expect(s.getItem('demo-2')!.finishId).toBe('nogal');
  });

  it('un arrastre completo es un solo paso del historial', () => {
    const s = make();
    s.beginGesture();
    s.move('demo-4', 3400, 290);
    s.move('demo-4', 3300, 290);
    s.move('demo-4', 3200, 290);
    s.endGesture();
    s.undo();
    expect(s.getItem('demo-4')!.x).toBe(3575);
  });

  it('rechaza medidas fuera de catálogo ajustándolas al rango', () => {
    const s = make();
    s.update('demo-4', { depth: 9999 });
    expect(s.getItem('demo-4')!.depth).toBe(650);
  });

  it('rechaza cambios que provocan colisiones', () => {
    const s = make();
    const ok = s.update('demo-2', { width: 1200 }); // invadiría... nada: hay hueco hasta el pilar
    expect(ok).toBe(true);
    const tooWide = s.update('demo-4', { width: 1200 }); // chocaría con la pared derecha
    expect(tooWide).toBe(false);
  });

  it('al cambiar el ancho mantiene el lado izquierdo fijo', () => {
    const s = make();
    const before = itemBox(s.getItem('demo-2')!).minX;
    s.update('demo-2', { width: 900 });
    expect(itemBox(s.getItem('demo-2')!).minX).toBeCloseTo(before);
  });

  it('ajuste a hueco hasta el pilar', () => {
    const s = make();
    const added = s.addItem('bajo')!; // aparece en el primer hueco libre del fondo
    s.fitToGap(added.id);
    const box = itemBox(s.getItem(added.id)!);
    expect(box.maxX - box.minX).toBeLessThanOrEqual(1200);
    expect(box.maxX - box.minX).toBeGreaterThan(600);
  });
});
