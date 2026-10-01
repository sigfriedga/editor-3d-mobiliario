import { inject, onUnmounted, provide, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import type { CatalogApi } from '../api/catalogApi';
import type { ProjectStore } from '../domain/store';
import type { ProjectState } from '../domain/types';

/**
 * Puente entre el `ProjectStore` (TypeScript puro) y Vue.
 *
 * Vue no "posee" el modelo: solo refleja el estado en refs reactivas al
 * recibir eventos del store. Así el núcleo del editor no depende del
 * framework y podría usarse igual desde React o desde Angular.
 */
export interface ProjectContext {
  store: ProjectStore;
  api: CatalogApi;
  state: ShallowRef<ProjectState>;
  selectedId: Ref<string | null>;
  /** Cambia cuando cambia algo que no es el modelo (p. ej. puertas abiertas). */
  viewVersion: Ref<number>;
  /** Avisos del store (restricciones incumplidas, etc.). */
  message: Ref<string>;
  /** Estado de la interacción en curso (imanes, bloqueos…). */
  status: Ref<string>;
}

const KEY: InjectionKey<ProjectContext> = Symbol('project');

export function provideProject(store: ProjectStore, api: CatalogApi): ProjectContext {
  const ctx: ProjectContext = {
    store,
    api,
    state: shallowRef(store.state),
    selectedId: ref(store.selectedId),
    viewVersion: ref(0),
    message: ref(''),
    status: ref(''),
  };
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  const offs = [
    store.on('change', (s) => (ctx.state.value = s)),
    store.on('selection', (id) => (ctx.selectedId.value = id)),
    store.on('view', () => ctx.viewVersion.value++),
    store.on('message', (m) => {
      ctx.message.value = m;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => (ctx.message.value = ''), 3500);
    }),
  ];
  onUnmounted(() => {
    offs.forEach((off) => off());
    clearTimeout(messageTimer);
  });
  provide(KEY, ctx);
  return ctx;
}

export function useProject(): ProjectContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('useProject() necesita provideProject() en un componente superior');
  return ctx;
}

/** Formato de dinero en euros. */
export const eur = (v: number) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
