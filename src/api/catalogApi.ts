/**
 * Capa de acceso a las APIs de catálogo, precios y pedidos.
 *
 * El editor depende de la INTERFAZ, no de la implementación: en la demo se usa
 * un mock en memoria y en producción se usaría `RestCatalogApi` contra el
 * backend real (p. ej. Laravel). Cambiar uno por otro no toca el editor.
 */
import { sampleCatalog } from '../domain/catalog';
import type { OrderPayload } from '../domain/order';
import type { Catalog } from '../domain/types';

export interface SubmitResult {
  reference: string;
  receivedAt: string;
}

export interface CatalogApi {
  getCatalog(): Promise<Catalog>;
  submitQuote(order: OrderPayload): Promise<SubmitResult>;
}

/** Implementación real contra una API REST/JSON. */
export class RestCatalogApi implements CatalogApi {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  getCatalog() {
    return this.request<Catalog>('/catalog');
  }

  submitQuote(order: OrderPayload) {
    return this.request<SubmitResult>('/quotes', { method: 'POST', body: JSON.stringify(order) });
  }
}

/** Mock para la demo: simula la latencia de red. */
export class MockCatalogApi implements CatalogApi {
  constructor(private latencyMs = 300) {}

  private delay() {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async getCatalog(): Promise<Catalog> {
    await this.delay();
    return structuredClone(sampleCatalog);
  }

  async submitQuote(order: OrderPayload): Promise<SubmitResult> {
    await this.delay();
    const n = order.modules.length;
    return {
      reference: `PRES-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}-${n}`,
      receivedAt: new Date().toISOString(),
    };
  }
}
