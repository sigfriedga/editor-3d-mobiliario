# Editor 3D de mobiliario (demo)

Prototipo de editor 3D web para configurar muebles a medida: colocar, mover y girar módulos, cambiar medidas y acabados, abrir puertas, añadir o quitar baldas, ajustar un módulo al hueco libre junto a un pilar y obtener el **despiece**, los **mecanizados** y el **precio** de la configuración.

**Tecnologías:** Vue 3 · TypeScript · Three.js · Vite · Vitest · GitHub Actions/Pages

## Funcionalidades

| Área | Qué hace |
| --- | --- |
| Interacción 3D | Selección por *raycasting*, arrastre sobre un plano horizontal, giro (R / botones, también ángulos libres), doble clic para abrir puertas, cámara orbital con vistas de perspectiva, planta y alzado |
| Restricciones | Los muebles no salen de la habitación ni atraviesan pilares u otros muebles (colisión SAT en 2D más intervalo de altura: un mueble colgado puede ir sobre uno bajo) |
| Imanes | Al acercarse a menos de 80 mm de una pared, un pilar u otro módulo, el mueble se alinea con él. Con Alt se desactivan |
| Cotas | Ancho, alto, fondo y altura al suelo del mueble seleccionado, más el hueco libre a cada lado hasta la pared, el pilar o el mueble vecino |
| Ajuste por pilares | "Ajustar al hueco" estira o encoge el ancho hasta los obstáculos, respetando los límites del catálogo |
| Modelo paramétrico | Cada mueble se convierte en piezas reales (laterales, suelo, techo, trasera, baldas, zócalo y puertas) con sus medidas de corte, canto y taladros |
| Precio | Se calcula a partir del despiece (m² por material, canto, herrajes y montaje), así que cualquier medida tiene un precio coherente |
| Exportación | JSON versionado con la configuración, el despiece y los mecanizados, pensado para la API de pedidos y el servicio CAD/CAM |
| Historial | Deshacer y rehacer (Ctrl+Z / Ctrl+Y); un arrastre completo cuenta como un solo paso |

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas unitarias (Vitest)
npm run typecheck  # comprobación de tipos (vue-tsc)
npm run build      # build de producción en dist/
```

Al hacer *push* a `main`, el workflow `.github/workflows/deploy.yml` ejecuta las pruebas, construye el proyecto y lo publica en GitHub Pages (en *Settings → Pages*, la fuente debe ser "GitHub Actions").

## Arquitectura

```
src/
  domain/   Lógica pura en TypeScript, sin Three.js ni Vue (se prueba con tests)
    types.ts        Modelo: catálogo, mueble, habitación, pilares
    catalog.ts      Catálogo de ejemplo y utilidades
    geometry2d.ts   Huellas en planta, cajas envolventes y colisión SAT
    layout.ts       Restricciones, imanes, huecos y ajuste a hueco
    cutlist.ts      Modelo paramétrico → despiece con mecanizados
    pricing.ts      Precio a partir del despiece
    order.ts        JSON de configuración para presupuestos/pedidos/CAD-CAM
    store.ts        Estado inmutable, historial, selección y eventos
  editor/   Vista 3D con Three.js (no contiene reglas de negocio)
    Editor.ts       Escena, cámara, render bajo demanda y sincronización con el store
    FurnitureView.ts  Mueble 3D construido a partir del despiece; puertas con pivote
    Interaction.ts  Ratón y teclado: selección, arrastre, giro y atajos
    DimensionsView.ts Cotas (líneas 3D y etiquetas HTML con CSS2DRenderer)
    RoomView.ts     Suelo, paredes (se ocultan si tapan la vista) y pilares
  api/      Interfaz CatalogApi + implementación REST y mock
  ui/       Componentes Vue (catálogo, propiedades, presupuesto y exportación)
tests/      Pruebas de geometría, restricciones, despiece, precio e historial
```

### Decisiones técnicas

1. **Dominio separado de la vista.** Las reglas (colisiones, imanes, despiece y precio) son funciones puras en `domain/`. Así se prueban sin navegador, se podrían reutilizar en el servidor para validar un pedido y el editor 3D solo "pinta" el estado.
2. **Una única fuente de verdad.** `ProjectStore` guarda el estado de forma inmutable. Three.js y Vue se suscriben a sus eventos y ninguno guarda una copia del modelo. Para saber qué ha cambiado basta con comparar referencias.
3. **Lo que se ve es lo que se fabrica.** La geometría 3D se genera a partir del mismo despiece que se envía a fabricación, en lugar de un modelo visual aparte.
4. **Milímetros en el dominio y metros en la escena.** La conversión está en un único sitio (`editor/units.ts`), y la convención de giro coincide con `rotation.y` de Three.js (comprobado en los tests).
5. **Vue no envuelve objetos de Three.js.** El editor se crea en `onMounted` y no es reactivo, para evitar los *proxies* de Vue sobre la escena, que son lentos y dan errores sutiles.
6. **Rendimiento.** El render es bajo demanda (solo se dibuja un fotograma si algo cambia), los materiales se comparten mediante caché, la geometría solo se regenera si cambian los parámetros que la afectan y las geometrías se liberan con `dispose()`. Three.js va en su propio *chunk* para aprovechar la caché del navegador. En la esquina del visor se ven las *draw calls*, los triángulos y las geometrías.
7. **Integración por interfaz.** El editor depende de `CatalogApi`. En la demo se usa un mock y en producción se usaría `RestCatalogApi` (por ejemplo, contra un backend Laravel).
8. **Formato de intercambio versionado.** El JSON exportado lleva `schemaVersion` y `units`. Los mecanizados son ilustrativos: el formato definitivo se acordaría con el especialista CAD/CAM.

### Siguientes pasos posibles

- Muebles en L y esquineros, y piezas recortadas alrededor del pilar (operaciones booleanas 2D)
- *InstancedMesh* para escenas con cientos de módulos y cálculo de colisiones en un Web Worker
- Pruebas end-to-end con Playwright (arrastrar, girar y comprobar el JSON resultante)
- Persistencia del proyecto en la API y carga de proyectos existentes

---

Los datos del catálogo y los precios son de ejemplo.
