<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <strong>Editor 3D de mobiliario</strong>
        <span class="tag">demo técnica</span>
      </div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Vista de cámara">
          <button
            v-for="v in presets"
            :key="v.id"
            :class="{ active: preset === v.id }"
            @click="setPreset(v.id)"
          >{{ v.label }}</button>
        </div>
        <div class="seg" role="group" aria-label="Historial">
          <button :disabled="!canUndo" title="Deshacer (Ctrl+Z)" @click="store.undo()">↶ Deshacer</button>
          <button :disabled="!canRedo" title="Rehacer (Ctrl+Y)" @click="store.redo()">Rehacer ↷</button>
        </div>
      </div>
    </header>

    <aside class="panel panel--left">
      <CatalogPanel />
    </aside>

    <main class="viewport">
      <div ref="canvasHost" class="viewport__canvas"></div>
      <div class="viewport__hint">
        Arrastra para mover · <kbd>R</kbd> girar · doble clic abre puertas · <kbd>Supr</kbd> eliminar · <kbd>Alt</kbd> sin imanes
      </div>
      <div v-if="stats" class="viewport__stats" title="renderer.info de Three.js">
        {{ stats.drawCalls }} draw calls · {{ stats.triangles.toLocaleString('es-ES') }} triángulos · {{ stats.geometries }} geometrías
      </div>
      <transition name="fade">
        <div v-if="message" class="toast toast--warn" role="status">{{ message }}</div>
        <div v-else-if="status" class="toast" role="status">{{ status }}</div>
      </transition>
    </main>

    <aside class="panel panel--right">
      <PropertiesPanel />
      <SummaryPanel @export="showExport = true" />
    </aside>

    <ExportDialog v-if="showExport" @close="showExport = false" />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import type { CatalogApi } from './api/catalogApi';
import type { ProjectStore } from './domain/store';
import { Editor, type CameraPreset } from './editor/Editor';
import CatalogPanel from './ui/CatalogPanel.vue';
import ExportDialog from './ui/ExportDialog.vue';
import PropertiesPanel from './ui/PropertiesPanel.vue';
import SummaryPanel from './ui/SummaryPanel.vue';
import { provideProject } from './ui/useProject';

export default defineComponent({
  name: 'App',
  components: { CatalogPanel, PropertiesPanel, SummaryPanel, ExportDialog },
  props: {
    store: { type: Object as PropType<ProjectStore>, required: true },
    api: { type: Object as PropType<CatalogApi>, required: true },
  },
  setup(props) {
    const ctx = provideProject(props.store, props.api);
    const canvasHost = ref<HTMLElement | null>(null);
    const preset = ref<CameraPreset>('perspectiva');
    const showExport = ref(false);
    const stats = ref<{ drawCalls: number; triangles: number; geometries: number } | null>(null);
    // El editor NO es reactivo a propósito: Vue no debe envolver objetos de Three.js.
    let editor: Editor | null = null;
    let statsTimer: ReturnType<typeof setInterval> | undefined;

    const presets: { id: CameraPreset; label: string }[] = [
      { id: 'perspectiva', label: 'Perspectiva' },
      { id: 'planta', label: 'Planta' },
      { id: 'frontal', label: 'Alzado' },
    ];

    onMounted(() => {
      if (!canvasHost.value) return;
      editor = new Editor(canvasHost.value, props.store, (msg) => (ctx.status.value = msg));
      statsTimer = setInterval(() => {
        if (editor) stats.value = editor.stats();
      }, 1000);
    });

    onBeforeUnmount(() => {
      clearInterval(statsTimer);
      editor?.dispose();
      editor = null;
    });

    function setPreset(p: CameraPreset) {
      preset.value = p;
      editor?.applyPreset(p);
    }

    // `state` cambia con cada modificación (incluido deshacer), así que sirve
    // como dependencia para recalcular valores que viven en el store.
    const canUndo = computed(() => {
      void ctx.state.value;
      return props.store.canUndo;
    });
    const canRedo = computed(() => {
      void ctx.state.value;
      return props.store.canRedo;
    });

    return {
      canvasHost,
      preset,
      presets,
      setPreset,
      canUndo,
      canRedo,
      showExport,
      stats,
      message: ctx.message,
      status: ctx.status,
    };
  },
});
</script>
