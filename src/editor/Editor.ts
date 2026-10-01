import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gapsAlongWidth } from '../domain/layout';
import type { ProjectStore } from '../domain/store';
import { DimensionsView } from './DimensionsView';
import { FurnitureView } from './FurnitureView';
import { Interaction } from './Interaction';
import { MaterialLibrary } from './MaterialLibrary';
import { RoomView } from './RoomView';
import { HELPER_LAYER, MM } from './units';

export type CameraPreset = 'perspectiva' | 'planta' | 'frontal';

interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
}

/**
 * Orquestador de la escena 3D.
 *
 * No contiene reglas de negocio: escucha al `ProjectStore` y sincroniza la
 * escena con su estado (patrón "vista que refleja un modelo"). Renderiza bajo
 * demanda: solo dibuja un fotograma cuando algo ha cambiado.
 */
export class Editor {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  readonly renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private materials: MaterialLibrary;
  private room: RoomView;
  private dims = new DimensionsView();
  private interaction: Interaction;
  private views = new Map<string, FurnitureView>();
  private clock = new THREE.Clock();
  private needsRender = true;
  private tween: CameraTween | null = null;
  private resizeObserver: ResizeObserver;
  private unsubscribe: (() => void)[] = [];
  private envTarget: THREE.WebGLRenderTarget;

  constructor(
    private container: HTMLElement,
    private store: ProjectStore,
    onStatus: (msg: string) => void = () => {},
  ) {
    // --- Renderizador ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    // --- Escena e iluminación ---
    this.scene.background = new THREE.Color(0xe7e4de);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.55;

    const { room } = store.state;
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(room.width * MM * 0.3, 5, room.depth * MM + 3);
    sun.target.position.set((room.width / 2) * MM, 0, (room.depth / 2) * MM);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -5;
    sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -5;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xcfc6b8, 0.6));

    this.room = new RoomView(room);
    this.scene.add(this.room.group, this.dims.group);
    this.materials = new MaterialLibrary(store.catalog);

    // --- Cámara y controles ---
    this.camera.layers.enable(HELPER_LAYER); // ver las ayudas (el raycaster no las ve)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // no meterse bajo el suelo
    this.controls.minDistance = 1;
    this.controls.maxDistance = 25;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', this.requestRender);

    this.interaction = new Interaction(
      this.renderer.domElement,
      this.camera,
      this.controls,
      store,
      () => [...this.views.values()].map((v) => v.root),
      onStatus,
    );

    // --- Sincronización con el modelo ---
    this.unsubscribe.push(
      store.on('change', () => this.sync()),
      store.on('selection', () => this.syncSelection()),
      store.on('view', () => this.syncDoors()),
    );
    this.sync();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyPreset('perspectiva', false); // tras resize: el encuadre depende de la proporción del visor
    this.renderer.setAnimationLoop(this.tick);
  }

  requestRender = () => {
    this.needsRender = true;
  };

  /** Crea, actualiza o elimina vistas para reflejar el estado actual. */
  private sync() {
    const items = this.store.state.items;
    const alive = new Set<string>();
    for (const item of items) {
      alive.add(item.id);
      let view = this.views.get(item.id);
      if (!view) {
        view = new FurnitureView(item, this.store.catalog, this.materials);
        this.views.set(item.id, view);
        this.scene.add(view.root);
      } else {
        view.update(item);
      }
    }
    for (const [id, view] of this.views) {
      if (!alive.has(id)) {
        view.dispose();
        this.views.delete(id);
      }
    }
    this.syncDoors();
    this.syncSelection();
  }

  private syncSelection() {
    const selected = this.store.selected;
    for (const [id, view] of this.views) view.setSelected(id === selected?.id);
    this.dims.show(selected, selected ? gapsAlongWidth(selected, this.store.state) : null);
    this.requestRender();
  }

  private syncDoors() {
    for (const [id, view] of this.views) view.setOpen(this.store.isOpen(id));
    this.requestRender();
  }

  private tick = () => {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.controls.update();

    let animating = false;
    for (const v of this.views.values()) animating = v.tick(dt) || animating;

    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.6);
      const k = 1 - Math.pow(1 - this.tween.t, 3); // ease-out
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
      if (this.tween.t >= 1) this.tween = null;
      animating = true;
    }

    if (animating || this.needsRender) {
      this.room.updateVisibility(this.camera);
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Vistas de cámara predefinidas, con transición suave. */
  applyPreset(preset: CameraPreset, animate = true) {
    const c = this.room.center;
    const { width, depth } = this.store.state.room;
    // En visores estrechos (móvil, ventana pequeña) alejamos la cámara para que quepa la habitación.
    const fit = Math.max(1, 1.25 / this.camera.aspect);
    const span = Math.max(width, depth) * MM * fit;
    const target = c.clone();
    let pos: THREE.Vector3;
    switch (preset) {
      case 'planta':
        target.y = 0;
        pos = new THREE.Vector3(c.x, span * 1.75, c.z + 0.001);
        break;
      case 'frontal':
        target.y = 1.1;
        pos = new THREE.Vector3(c.x, 1.4, c.z + span * 1.45);
        break;
      default:
        pos = new THREE.Vector3(c.x + span * 0.55, span * 0.75, c.z + span * 1.15);
    }
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.requestRender();
      return;
    }
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: pos,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      t: 0,
    };
  }

  /** Estadísticas de rendimiento para el panel de depuración. */
  stats() {
    const info = this.renderer.info;
    return { drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.unsubscribe.forEach((u) => u());
    this.resizeObserver.disconnect();
    this.interaction.dispose();
    this.controls.dispose();
    this.views.forEach((v) => v.dispose());
    this.views.clear();
    this.dims.dispose();
    this.room.dispose();
    this.materials.dispose();
    this.envTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
