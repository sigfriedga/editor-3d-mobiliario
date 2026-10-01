import * as THREE from 'three';
import type { Room } from '../domain/types';
import { MM, asHelper } from './units';

const WALL_THICKNESS = 100;
const GRID_STEP = 500;

/**
 * Habitación: suelo con cuadrícula, paredes y pilares.
 * Las paredes se ocultan cuando la cámara está detrás de ellas, para que
 * nunca tapen los muebles al orbitar.
 */
export class RoomView {
  readonly group = new THREE.Group();
  private walls: { mesh: THREE.Mesh; isVisibleFrom: (cam: THREE.Vector3) => boolean }[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(private room: Room) {
    const W = room.width * MM;
    const D = room.depth * MM;
    const H = room.height * MM;
    const t = WALL_THICKNESS * MM;

    const floorMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd9cfc1, roughness: 0.92 }));
    const wallMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.95 }));
    const pillarMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe1ddd5, roughness: 0.95 }));

    const floorGeo = this.track(new THREE.PlaneGeometry(W, D));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(W / 2, 0, D / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Cuadrícula cada 500 mm, limitada al suelo de la habitación.
    const pts: number[] = [];
    for (let x = GRID_STEP; x < room.width; x += GRID_STEP) pts.push(x * MM, 0.001, 0, x * MM, 0.001, D);
    for (let y = GRID_STEP; y < room.depth; y += GRID_STEP) pts.push(0, 0.001, y * MM, W, 0.001, y * MM);
    const gridGeo = this.track(new THREE.BufferGeometry());
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const gridMat = this.track(new THREE.LineBasicMaterial({ color: 0xc2b8aa }));
    this.group.add(asHelper(new THREE.LineSegments(gridGeo, gridMat)));

    const addWall = (w: number, h: number, d: number, pos: THREE.Vector3, isVisibleFrom: (c: THREE.Vector3) => boolean) => {
      const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), wallMat);
      mesh.position.copy(pos);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.walls.push({ mesh, isVisibleFrom });
    };
    // Fondo (y < 0), izquierda (x < 0) y derecha (x > ancho). El frente queda abierto.
    addWall(W + 2 * t, H, t, new THREE.Vector3(W / 2, H / 2, -t / 2), (c) => c.z > 0);
    addWall(t, H, D, new THREE.Vector3(-t / 2, H / 2, D / 2), (c) => c.x > 0);
    addWall(t, H, D, new THREE.Vector3(W + t / 2, H / 2, D / 2), (c) => c.x < W);

    for (const p of room.pillars) {
      const geo = this.track(new THREE.BoxGeometry(p.width * MM, H, p.depth * MM));
      const pillar = new THREE.Mesh(geo, pillarMat);
      pillar.position.set((p.x + p.width / 2) * MM, H / 2, (p.y + p.depth / 2) * MM);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      pillar.name = 'Pilar';
      pillar.add(asHelper(new THREE.LineSegments(this.track(new THREE.EdgesGeometry(geo)), gridMat)));
      this.group.add(pillar);
    }
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  /** Oculta las paredes que quedan entre la cámara y la habitación. */
  updateVisibility(camera: THREE.Camera) {
    for (const w of this.walls) w.mesh.visible = w.isVisibleFrom(camera.position);
  }

  get center(): THREE.Vector3 {
    return new THREE.Vector3((this.room.width / 2) * MM, 0.8, (this.room.depth / 2) * MM);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}
