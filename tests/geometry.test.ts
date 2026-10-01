import { describe, expect, it } from 'vitest';
import { aabbOf, convexOverlap, footprint, localToWorld } from '../src/domain/geometry2d';

describe('geometry2d', () => {
  it('sin rotación, la huella es el rectángulo centrado', () => {
    const box = aabbOf(footprint({ x: 300, y: 290, rotation: 0, width: 600, depth: 580 }));
    expect(box).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 580 });
  });

  it('girado 90°, ancho y fondo se intercambian', () => {
    const box = aabbOf(footprint({ x: 1000, y: 1000, rotation: 90, width: 600, depth: 400 }));
    expect(box.maxX - box.minX).toBeCloseTo(400);
    expect(box.maxY - box.minY).toBeCloseTo(600);
  });

  it('usa la misma convención de giro que Three.js (rotation.y)', () => {
    // En Three.js, girar +90° en Y lleva el eje +X local hacia -Z (aquí -Y).
    const p = localToWorld({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-1);
  });

  it('dos módulos que se tocan no colisionan; si se pisan, sí', () => {
    const a = footprint({ x: 300, y: 300, rotation: 0, width: 600, depth: 600 });
    const touching = footprint({ x: 900, y: 300, rotation: 0, width: 600, depth: 600 });
    const overlapping = footprint({ x: 880, y: 300, rotation: 0, width: 600, depth: 600 });
    expect(convexOverlap(a, touching)).toBe(false);
    expect(convexOverlap(a, overlapping)).toBe(true);
  });

  it('detecta colisión con muebles girados (no solo cajas alineadas)', () => {
    const a = footprint({ x: 0, y: 0, rotation: 45, width: 1000, depth: 100 });
    const b = footprint({ x: 400, y: 400, rotation: 0, width: 100, depth: 100 });
    // Las cajas envolventes se solapan, pero las piezas reales no.
    expect(convexOverlap(a, b)).toBe(false);
  });
});
