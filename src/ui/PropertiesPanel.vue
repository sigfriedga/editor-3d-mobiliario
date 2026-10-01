<template>
  <section class="card">
    <h2 class="card__title">Propiedades</h2>

    <p v-if="!item || !type" class="muted small">
      Selecciona un mueble en la escena o en la lista para editar sus medidas, acabados y componentes.
    </p>

    <template v-else>
      <div class="props-head">
        <strong>{{ type.name }}</strong>
        <span class="price-pill">{{ eur(itemPrice) }}</span>
      </div>

      <h3 class="subhead">Medidas (mm)</h3>
      <div v-for="f in dimFields" :key="f.key" class="field">
        <label :for="'f-' + f.key">{{ f.label }}</label>
        <input
          type="range"
          :min="f.range.min"
          :max="f.range.max"
          :step="f.range.step"
          :value="item[f.key]"
          :aria-label="f.label"
          @pointerdown="store.beginGesture()"
          @pointerup="store.endGesture()"
          @input="setNum(f.key, $event)"
          @change="store.endGesture()"
        />
        <input
          :id="'f-' + f.key"
          class="num"
          type="number"
          :min="f.range.min"
          :max="f.range.max"
          :step="f.range.step"
          :value="item[f.key]"
          @change="setNum(f.key, $event)"
        />
      </div>
      <div class="field">
        <label for="f-elev">Altura al suelo</label>
        <span class="muted small grow">{{ type.kind === 'alto' ? 'mueble colgado' : 'apoyado en el suelo' }}</span>
        <input id="f-elev" class="num" type="number" step="10" min="0" :value="item.elevation" @change="setNum('elevation', $event)" />
      </div>

      <div v-if="gap" class="gap-info">
        <span>Hueco libre:</span>
        <span>← {{ Math.round(gap.lowGap) }} mm <span class="muted">({{ gap.lowLabel }})</span></span>
        <span>{{ Math.round(gap.highGap) }} mm <span class="muted">({{ gap.highLabel }})</span> →</span>
      </div>

      <h3 class="subhead">Acabado</h3>
      <div class="swatches" role="radiogroup" aria-label="Acabado">
        <button
          v-for="f in finishes"
          :key="f.id"
          class="swatch-btn"
          :class="{ active: f.id === item.finishId }"
          role="radio"
          :aria-checked="f.id === item.finishId"
          :title="f.name + ' · ' + f.pricePerM2 + ' €/m²'"
          @click="set({ finishId: f.id })"
        >
          <span class="swatch swatch--lg" :style="{ background: f.color }"></span>
          <span class="small">{{ f.name }}</span>
        </button>
      </div>

      <h3 class="subhead">Componentes</h3>
      <div v-if="type.doors.max > 0" class="field">
        <label>Puertas</label>
        <div class="seg seg--small">
          <button
            v-for="n in doorOptions"
            :key="n"
            :class="{ active: item.doors === n }"
            @click="set({ doors: n })"
          >{{ n }}</button>
        </div>
      </div>
      <div class="field">
        <label>Baldas</label>
        <div class="stepper">
          <button :disabled="item.shelves <= type.shelves.min" aria-label="Quitar balda" @click="set({ shelves: item.shelves - 1 })">−</button>
          <span>{{ item.shelves }}</span>
          <button :disabled="item.shelves >= type.shelves.max" aria-label="Añadir balda" @click="set({ shelves: item.shelves + 1 })">+</button>
        </div>
      </div>

      <h3 class="subhead">Posición</h3>
      <div class="field field--wrap">
        <label>Giro</label>
        <span class="muted small grow">{{ Math.round(item.rotation) }}°</span>
        <div class="seg seg--small seg--full">
          <button title="Girar -90° (Mayús+R)" @click="store.rotate(item.id, -90)">↺ 90°</button>
          <button title="Girar -15°" @click="store.rotate(item.id, -15)">−15°</button>
          <button title="Girar +15°" @click="store.rotate(item.id, 15)">+15°</button>
          <button title="Girar +90° (R)" @click="store.rotate(item.id, 90)">↻ 90°</button>
        </div>
      </div>

      <div class="actions">
        <button v-if="item.doors > 0" class="btn" @click="store.toggleDoors(item.id)">
          {{ isOpen ? 'Cerrar puertas' : 'Abrir puertas' }}
        </button>
        <button class="btn" title="Estira o encoge el ancho hasta la pared, el pilar o el mueble vecino" @click="store.fitToGap(item.id)">
          Ajustar al hueco
        </button>
        <button class="btn" @click="store.duplicate(item.id)">Duplicar</button>
        <button class="btn btn--danger" @click="store.remove(item.id)">Eliminar</button>
      </div>

      <details class="cutlist">
        <summary>Despiece ({{ panels.length }} piezas)</summary>
        <table>
          <thead>
            <tr><th>Pieza</th><th>Largo × ancho × grueso</th><th>Material</th><th title="Mecanizados">Mec.</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in panels" :key="p.id">
              <td>{{ p.name }}</td>
              <td class="mono">{{ p.length }} × {{ p.width }} × {{ p.thickness }}</td>
              <td>{{ materialName(p.materialId) }}</td>
              <td class="mono">{{ p.operations.length || '' }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </section>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import { getMaterial, getType } from '../domain/catalog';
import { buildCutList } from '../domain/cutlist';
import { gapsAlongWidth } from '../domain/layout';
import { priceItem } from '../domain/pricing';
import type { FurnitureItem } from '../domain/types';
import { eur, useProject } from './useProject';

type NumericField = 'width' | 'height' | 'depth' | 'elevation';

export default defineComponent({
  name: 'PropertiesPanel',
  setup() {
    const { store, state, selectedId, viewVersion } = useProject();
    const catalog = store.catalog;

    const item = computed<FurnitureItem | null>(() => {
      const id = selectedId.value;
      return id ? (state.value.items.find((i) => i.id === id) ?? null) : null;
    });
    const type = computed(() => (item.value ? getType(catalog, item.value.typeId) : null));
    const panels = computed(() => (item.value ? buildCutList(item.value, catalog) : []));
    const itemPrice = computed(() => (item.value ? priceItem(item.value, catalog, panels.value).total : 0));
    const gap = computed(() => (item.value ? gapsAlongWidth(item.value, state.value) : null));
    const isOpen = computed(() => {
      void viewVersion.value;
      return item.value ? store.isOpen(item.value.id) : false;
    });
    const dimFields = computed(() => {
      const t = type.value;
      if (!t) return [];
      return [
        { key: 'width' as const, label: 'Ancho', range: t.width },
        { key: 'height' as const, label: 'Alto', range: t.height },
        { key: 'depth' as const, label: 'Fondo', range: t.depth },
      ];
    });
    const doorOptions = computed(() => {
      const t = type.value;
      if (!t) return [];
      const out: number[] = [];
      for (let n = t.doors.min; n <= t.doors.max; n++) out.push(n);
      return out;
    });

    function set(patch: Partial<FurnitureItem>) {
      if (item.value) store.update(item.value.id, patch);
    }

    function setNum(key: NumericField, ev: Event) {
      const input = ev.target as HTMLInputElement;
      const value = Number(input.value);
      if (!Number.isFinite(value) || !item.value) return;
      const id = item.value.id;
      store.update(id, { [key]: value });
      // El store puede ajustar el valor al rango del catálogo o rechazarlo por
      // colisión: el campo muestra siempre el valor real resultante.
      const real = store.getItem(id);
      if (real) input.value = String(real[key]);
    }

    return {
      store,
      item,
      type,
      panels,
      itemPrice,
      gap,
      isOpen,
      dimFields,
      doorOptions,
      finishes: catalog.finishes,
      set,
      setNum,
      eur,
      materialName: (id: string) => getMaterial(catalog, id).name,
    };
  },
});
</script>
