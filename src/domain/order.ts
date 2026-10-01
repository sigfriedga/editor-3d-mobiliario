/**
 * Configuración exportable: lo que el editor enviaría a la API de
 * presupuestos/pedidos y, desde ahí, al servicio CAD/CAM.
 *
 * Es un JSON versionado (`schemaVersion`) para poder evolucionar el formato
 * sin romper a quien lo consume.
 */
import { getType } from './catalog';
import { buildCutList } from './cutlist';
import { priceProject } from './pricing';
import type { Catalog, ProjectState } from './types';

export const ORDER_SCHEMA_VERSION = 1;

export function buildOrderPayload(state: ProjectState, catalog: Catalog) {
  const price = priceProject(state, catalog);
  return {
    schemaVersion: ORDER_SCHEMA_VERSION,
    catalogVersion: catalog.version,
    units: 'mm',
    room: state.room,
    modules: state.items.map((item) => {
      const panels = buildCutList(item, catalog);
      return {
        id: item.id,
        type: item.typeId,
        name: getType(catalog, item.typeId).name,
        placement: { x: item.x, y: item.y, elevation: item.elevation, rotationDeg: item.rotation },
        parameters: {
          width: item.width,
          height: item.height,
          depth: item.depth,
          finish: item.finishId,
          doors: item.doors,
          shelves: item.shelves,
        },
        cutList: panels.map((p) => ({
          id: p.id,
          role: p.role,
          name: p.name,
          material: p.materialId,
          length: p.length,
          width: p.width,
          thickness: p.thickness,
          edgeBandingM: Math.round(p.edgeBandingM * 100) / 100,
          operations: p.operations,
        })),
        price: price.items.find((i) => i.itemId === item.id)?.total ?? 0,
      };
    }),
    totals: { subtotal: price.subtotal, vat: price.vat, total: price.total, currency: catalog.currency },
  };
}

export type OrderPayload = ReturnType<typeof buildOrderPayload>;
