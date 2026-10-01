/**
 * Precio calculado a partir del despiece (no de una tabla por modelo):
 * así cualquier medida intermedia tiene un precio coherente.
 */
import { getMaterial, getType } from './catalog';
import { buildCutList, hingeCount, panelArea, type Panel } from './cutlist';
import type { Catalog, FurnitureItem, ProjectState } from './types';

export interface PriceLine {
  concept: string;
  amount: number;
}

export interface ItemPrice {
  itemId: string;
  typeName: string;
  lines: PriceLine[];
  total: number;
}

const money = (v: number) => Math.round(v * 100) / 100;

export function priceItem(item: FurnitureItem, catalog: Catalog, panels: Panel[] = buildCutList(item, catalog)): ItemPrice {
  const hw = catalog.hardware;
  const byMaterial = new Map<string, number>();
  for (const p of panels) byMaterial.set(p.materialId, (byMaterial.get(p.materialId) ?? 0) + panelArea(p));

  const lines: PriceLine[] = [];
  for (const [materialId, m2] of byMaterial) {
    const mat = getMaterial(catalog, materialId);
    lines.push({ concept: `${mat.name} (${m2.toFixed(2)} m²)`, amount: money(m2 * mat.pricePerM2) });
  }
  const edge = panels.reduce((s, p) => s + p.edgeBandingM, 0);
  lines.push({ concept: `Canto (${edge.toFixed(1)} m)`, amount: money(edge * hw.edgeBandingPerMeter) });

  const hinges = hingeCount(panels);
  if (hinges > 0) lines.push({ concept: `Bisagras (${hinges})`, amount: money(hinges * hw.hingePrice) });
  const supports = item.shelves * 4;
  if (supports > 0) lines.push({ concept: `Soportes de balda (${supports})`, amount: money(supports * hw.shelfSupportPrice) });
  lines.push({ concept: 'Montaje', amount: hw.assemblyPerModule });

  return {
    itemId: item.id,
    typeName: getType(catalog, item.typeId).name,
    lines,
    total: money(lines.reduce((s, l) => s + l.amount, 0)),
  };
}

export interface ProjectPrice {
  items: ItemPrice[];
  subtotal: number;
  vat: number;
  total: number;
}

export const VAT_RATE = 0.21;

export function priceProject(state: ProjectState, catalog: Catalog): ProjectPrice {
  const items = state.items.map((i) => priceItem(i, catalog));
  const subtotal = money(items.reduce((s, i) => s + i.total, 0));
  const vat = money(subtotal * VAT_RATE);
  return { items, subtotal, vat, total: money(subtotal + vat) };
}
