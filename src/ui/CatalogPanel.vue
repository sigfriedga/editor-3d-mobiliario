<template>
  <section class="card">
    <h2 class="card__title">Catálogo</h2>
    <p class="muted small">Haz clic para añadir. Se coloca en el primer hueco libre.</p>
    <ul class="catalog">
      <li v-for="t in types" :key="t.id">
        <button class="catalog__item" @click="add(t.id)">
          <svg class="catalog__icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect :x="icon(t.kind).x" :y="icon(t.kind).y" :width="icon(t.kind).w" :height="icon(t.kind).h" rx="1.5" />
            <line
              v-for="(l, i) in icon(t.kind).lines"
              :key="i"
              :x1="l[0]" :y1="l[1]" :x2="l[2]" :y2="l[3]"
            />
          </svg>
          <span>
            <strong>{{ t.name }}</strong>
            <span class="muted small">{{ t.width.default }} × {{ t.height.default }} × {{ t.depth.default }} mm</span>
          </span>
        </button>
      </li>
    </ul>
  </section>

  <section class="card">
    <h2 class="card__title">En el proyecto <span class="badge">{{ items.length }}</span></h2>
    <p v-if="!items.length" class="muted small">Todavía no hay muebles.</p>
    <ul class="item-list">
      <li v-for="(item, i) in items" :key="item.id">
        <button
          class="item-list__row"
          :class="{ active: item.id === selectedId }"
          @click="store.select(item.id)"
        >
          <span class="swatch" :style="{ background: finishColor(item.finishId) }"></span>
          <span class="grow">{{ i + 1 }}. {{ typeName(item.typeId) }}</span>
          <span class="muted small">{{ item.width }} mm</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import { getMaterial, getType } from '../domain/catalog';
import type { FurnitureKind } from '../domain/types';
import { useProject } from './useProject';

interface Icon {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: [number, number, number, number][];
}

const ICONS: Record<FurnitureKind, Icon> = {
  bajo: { x: 6, y: 16, w: 28, h: 20, lines: [[20, 18, 20, 32], [6, 32, 34, 32]] },
  alto: { x: 6, y: 4, w: 28, h: 16, lines: [[20, 6, 20, 18]] },
  columna: { x: 11, y: 3, w: 18, h: 34, lines: [[20, 5, 20, 33], [11, 33, 29, 33]] },
  estanteria: { x: 8, y: 3, w: 24, h: 34, lines: [[8, 11, 32, 11], [8, 19, 32, 19], [8, 27, 32, 27]] },
};

export default defineComponent({
  name: 'CatalogPanel',
  setup() {
    const { store, state, selectedId } = useProject();
    const items = computed(() => state.value.items);
    return {
      store,
      types: store.catalog.types,
      items,
      selectedId,
      icon: (kind: FurnitureKind) => ICONS[kind],
      add: (typeId: string) => store.addItem(typeId),
      typeName: (id: string) => getType(store.catalog, id).name,
      finishColor: (id: string) => getMaterial(store.catalog, id).color,
    };
  },
});
</script>
