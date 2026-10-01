<template>
  <section class="card">
    <h2 class="card__title">Presupuesto</h2>
    <ul class="summary">
      <li v-for="(line, i) in price.items" :key="line.itemId" :class="{ active: line.itemId === selectedId }">
        <button class="summary__row" @click="store.select(line.itemId)">
          <span class="grow">{{ i + 1 }}. {{ line.typeName }}</span>
          <span class="mono">{{ eur(line.total) }}</span>
        </button>
      </li>
    </ul>
    <dl class="totals">
      <dt>Base imponible</dt><dd class="mono">{{ eur(price.subtotal) }}</dd>
      <dt>IVA (21 %)</dt><dd class="mono">{{ eur(price.vat) }}</dd>
      <dt class="total">Total</dt><dd class="mono total">{{ eur(price.total) }}</dd>
    </dl>
    <p class="muted small">Precio calculado a partir del despiece con un catálogo de ejemplo.</p>
    <div class="actions">
      <button class="btn" @click="$emit('export')">Ver configuración (JSON)</button>
      <button class="btn btn--primary" :disabled="sending || !price.items.length" @click="send">
        {{ sending ? 'Enviando…' : 'Enviar presupuesto' }}
      </button>
    </div>
    <p v-if="sent" class="ok small" role="status">
      Recibido por la API simulada · referencia <strong>{{ sent }}</strong>
    </p>
  </section>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import { buildOrderPayload } from '../domain/order';
import { priceProject } from '../domain/pricing';
import { eur, useProject } from './useProject';

export default defineComponent({
  name: 'SummaryPanel',
  emits: ['export'],
  setup() {
    const { store, api, state, selectedId } = useProject();
    const price = computed(() => priceProject(state.value, store.catalog));
    const sending = ref(false);
    const sent = ref('');

    async function send() {
      sending.value = true;
      sent.value = '';
      try {
        const res = await api.submitQuote(buildOrderPayload(state.value, store.catalog));
        sent.value = res.reference;
      } finally {
        sending.value = false;
      }
    }

    return { store, price, selectedId, sending, sent, send, eur };
  },
});
</script>
