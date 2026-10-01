<template>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" @click.self="$emit('close')">
    <div class="modal__box">
      <header class="modal__head">
        <h2 id="export-title">Configuración para presupuesto y fabricación</h2>
        <button class="icon-btn" aria-label="Cerrar" @click="$emit('close')">✕</button>
      </header>
      <p class="muted small">
        Este JSON es lo que el editor enviaría a la API de pedidos y, desde allí, al servicio CAD/CAM:
        parámetros de cada módulo, su posición, el despiece con mecanizados y el precio.
      </p>
      <pre class="code">{{ json }}</pre>
      <footer class="actions">
        <button class="btn" @click="copy">{{ copied ? 'Copiado' : 'Copiar' }}</button>
        <button class="btn btn--primary" @click="download">Descargar .json</button>
      </footer>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { buildOrderPayload } from '../domain/order';
import { useProject } from './useProject';

export default defineComponent({
  name: 'ExportDialog',
  emits: ['close'],
  setup(_, { emit }) {
    const { store, state } = useProject();
    const json = computed(() => JSON.stringify(buildOrderPayload(state.value, store.catalog), null, 2));
    const copied = ref(false);

    async function copy() {
      try {
        await navigator.clipboard.writeText(json.value);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1500);
      } catch {
        /* el navegador puede bloquear el portapapeles */
      }
    }

    function download() {
      const blob = new Blob([json.value], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'configuracion-mobiliario.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') emit('close');
    };
    onMounted(() => window.addEventListener('keydown', onKey));
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

    return { json, copied, copy, download };
  },
});
</script>
