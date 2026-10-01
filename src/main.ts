import { createApp } from 'vue';
import App from './App.vue';
import { MockCatalogApi } from './api/catalogApi';
import { ProjectStore, demoProject } from './domain/store';
import './styles.css';

async function bootstrap() {
  // En producción: new RestCatalogApi(import.meta.env.VITE_API_URL, token)
  const api = new MockCatalogApi();
  const catalog = await api.getCatalog();
  const store = new ProjectStore(catalog, demoProject());
  createApp(App, { store, api }).mount('#app');
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('app');
  if (el) el.textContent = 'No se pudo cargar el catálogo.';
});
