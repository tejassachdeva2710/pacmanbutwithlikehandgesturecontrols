import * as THREE from "three";
import { MAZE_H, MAZE_W, tileAt } from "../game/maze";
import { dirVector, posOf, type GameState } from "../game/engine";

interface GhostRig {
  id: number;
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  normalEyes: THREE.Group;
  scaryFace: THREE.Group;
  light: THREE.PointLight;
}

const TAU = Math.PI * 2;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function makeFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0718";
  ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createRadialGradient(256, 256, 20, 256, 256, 340);
  glow.addColorStop(0, "rgba(96,64,210,0.32)");
  glow.addColorStop(0.55, "rgba(46,24,110,0.16)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i <= 8; i++) {
    ctx.strokeStyle = i % 4 === 0 ? "rgba(110,88,255,0.32)" : "rgba(76,56,168,0.16)";
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo((i / 8) * 512, 0);
    ctx.lineTo((i / 8) * 512, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i / 8) * 512);
    ctx.lineTo(512, (i / 8) * 512);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * 0.08;
    ctx.fillStyle = `rgba(180,160,255,${a})`;
    const s = Math.random() * 2 + 0.5;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 4;
  return tex;
}

export class Scene3D {
  ok = false;
  private container: HTMLElement;
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private ghosts: GhostRig[] = [];
  private pacGroup?: THREE.Group;
  private pacLight?: THREE.PointLight;
  private pellets?: THREE.InstancedMesh;
  private powerPellets?: THREE.InstancedMesh;
  private pelletKeys: string[] = [];
  private powerKeys: string[] = [];
  private stars?: THREE.Points;
  private dust?: THREE.Points;
  private redLight?: THREE.PointLight;
  private fog?: THREE.FogExp2;
  private yaw = 0.16;
  private pitch = 1.06;
  private dist = 19;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private camPos = new THREE.Vector3(9, 16, 22);
  private camLook = new THREE.Vector3(9, 0, 9);
  private disposed = false;
  private initialised = false;

  constructor(container: HTMLElement) {
    this.container = container;
    try {
      this.setup();
      this.ok = true;
    } catch (err) {
      console.warn("3D scene unavailable", err);
      this.ok = false;
      try {
        this.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  private setup() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060410);
    const fog = new THREE.FogExp2(0x0b0620, 0.026);
    scene.fog = fog;
    this.fog = fog;

    const camera = new THREE.PerspectiveCamera(54, 1, 0.08, 160);
    camera.position.copy(this.camPos);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = scene;

    // Lights
    scene.add(new THREE.AmbientLight(0x8373ee, 0.9));
    const hemi = new THREE.HemisphereLight(0xa58fff, 0x140b30, 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0x9fe7ff, 1.35);
    key.position.set(6, 18, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff4f9a, 0.85);
    rim.position.set(-12, 8, -10);
    scene.add(rim);
    const centre = new THREE.PointLight(0x7b4dff, 35, 24, 2);
    centre.position.set(MAZE_W / 2, 4, MAZE_H / 2);
    scene.add(centre);

    const red = new THREE.PointLight(0xff2244, 0, 9, 2);
    red.position.set(9, 1, 9);
    scene.add(red);
    this.redLight = red;

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({
      map: makeFloorTexture(),
      color: 0xb3a5ff,
      emissive: 0x241552,
      emissiveIntensity: 1.05,
      roughness: 0.38,
      metalness: 0.55,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAZE_W, MAZE_H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAZE_W / 2 - 0.5, 0, MAZE_H / 2 - 0.5);
    scene.add(floor);

    const voidMat = new THREE.MeshStandardMaterial({ color: 0x05030c, roughness: 0.9, metalness: 0.2 });
    const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), voidMat);
    voidPlane.rotation.x = -Math.PI / 2;
    voidPlane.position.set(MAZE_W / 2 - 0.5, -0.06, MAZE_H / 2 - 0.5);
    scene.add(voidPlane);

    // Walls
    const walls: { x: number; y: number }[] = [];
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W; x++) {
        if (tileAt(x, y) === "#") walls.push({ x, y });
      }
    }
    const wallGeo = new THREE.BoxGeometry(0.99, 1.16, 0.99);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2f2368,
      emissive: 0x2e2074,
      emissiveIntensity: 0.72,
      roughness: 0.42,
      metalness: 0.7,
    });
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    walls.forEach((w, i) => {
      matrix.makeTranslation(w.x, 0.58, w.y);
      wallMesh.setMatrixAt(i, matrix);
      const border = w.x === 0 || w.y === 0 || w.x === MAZE_W - 1 || w.y === MAZE_H - 1;
      colour.set(border ? 0x3b2d86 : 0x251a58);
      wallMesh.setColorAt(i, colour);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    scene.add(wallMesh);

    const capGeo = new THREE.BoxGeometry(1.0, 0.045, 1.0);
    const capMat = new THREE.MeshBasicMaterial({ color: 0x9a86ff, toneMapped: false });
    const caps = new THREE.InstancedMesh(capGeo, capMat, walls.length);
    walls.forEach((w, i) => {
      matrix.makeTranslation(w.x, 1.175, w.y);
      caps.setMatrixAt(i, matrix);
    });
    caps.instanceMatrix.needsUpdate = true;
    scene.add(caps);

    // Ghost house door
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xff5fa2, toneMapped: false });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.12), doorMat);
    door.position.set(9, 0.62, 8);
    scene.add(door);
    const doorGlow = new THREE.PointLight(0xff4d9d, 7, 5, 2);
    doorGlow.position.set(9, 1, 9);
    scene.add(doorGlow);

    // Corner pillars
    [
      [0, 0],
      [MAZE_W - 1, 0],
      [0, MAZE_H - 1],
      [MAZE_W - 1, MAZE_H - 1],
    ].forEach(([x, y]) => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.28, 2.3, 8),
        new THREE.MeshStandardMaterial({ color: 0x221847, emissive: 0x4a2dff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 })
      );
      pillar.position.set(x, 1.15, y);
      scene.add(pillar);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x67f5ff, toneMapped: false })
      );
      orb.position.set(x, 2.36, y);
      scene.add(orb);
      const l = new THREE.PointLight(0x4fe0ff, 7, 6, 2);
      l.position.set(x, 2.4, y);
      scene.add(l);
    });

    // Pellets
    const allPellets: { key: string; x: number; y: number; power: boolean }[] = [];
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W; x++) {
        const t = tileAt(x, y);
        if (t === "." || t === "o") allPellets.push({ key: `${x},${y}`, x, y, power: t === "o" });
      }
    }
    this.pelletKeys = allPellets.filter((p) => !p.power).map((p) => p.key);
    this.powerKeys = allPellets.filter((p) => p.power).map((p) => p.key);

    const pelletGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const pelletMat = new THREE.MeshBasicMaterial({ color: 0xffe374, toneMapped: false });
    const pellets = new THREE.InstancedMesh(pelletGeo, pelletMat, this.pelletKeys.length);
    pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(pellets);
    this.pellets = pellets;

    const powerGeo = new THREE.OctahedronGeometry(0.2, 0);
    const powerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a3, toneMapped: false });
    const power = new THREE.InstancedMesh(powerGeo, powerMat, Math.max(1, this.powerKeys.length));
    power.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(power);
    this.powerPellets = power;

    // Pac-Man
    const pacGroup = new THREE.Group();
    const pacMat = new THREE.MeshStandardMaterial({
      color: 0xffd93d,
      emissive: 0xffb300,
      emissiveIntensity: 1.15,
      roughness: 0.28,
      metalness: 0.35,
    });
    const pacGeo = new THREE.SphereGeometry(0.44, 32, 20, 0.32, TAU - 0.64);
    const pacBody = new THREE.Mesh(pacGeo, pacMat);
    pacBody.rotation.y = Math.PI;
    pacGroup.add(pacBody);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241536 });
    [-0.14, 0.14].forEach((z) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
      eye.position.set(0.05, 0.3, z);
      pacGroup.add(eye);
    });
    const pacLight = new THREE.PointLight(0xffcf33, 14, 6.5, 2);
    pacLight.position.set(0, 0.5, 0);
    pacGroup.add(pacLight);
    this.pacLight = pacLight;
    scene.add(pacGroup);
    this.pacGroup = pacGroup;

    // Ghosts
    const meta = [
      { color: 0xff3358 },
      { color: 0xff63d8 },
      { color: 0x2ee6ff },
      { color: 0xffab35 },
    ];
    meta.forEach((m, id) => {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: m.color,
        emissive: m.color,
        emissiveIntensity: 0.55,
        roughness: 0.34,
        metalness: 0.3,
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.37, 24, 18), bodyMat);
      body.scale.set(1, 1.12, 1);
      body.position.y = 0.62;
      group.add(body);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.43, 20, 1, true), bodyMat);
      skirt.position.y = 0.36;
      group.add(skirt);
      for (let i = 0; i < 5; i++) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), bodyMat);
        const a = (i / 5) * TAU;
        bump.position.set(Math.cos(a) * 0.28, 0.17, Math.sin(a) * 0.24);
        group.add(bump);
      }

      const normalEyes = new THREE.Group();
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf4f1ff });
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x160d2b });
      [-0.145, 0.145].forEach((x) => {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), whiteMat);
        white.position.set(x, 0.7, 0.29);
        white.scale.set(1, 1.22, 0.8);
        normalEyes.add(white);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.047, 8, 8), pupilMat);
        pupil.position.set(x, 0.7, 0.365);
        normalEyes.add(pupil);
      });
      group.add(normalEyes);

      const scaryFace = new THREE.Group();
      const sclera = new THREE.MeshBasicMaterial({ color: 0xfff2e8 });
      const iris = new THREE.MeshBasicMaterial({ color: 0xff1f45, toneMapped: false });
      [-0.17, 0.17].forEach((x) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), sclera);
        eye.position.set(x, 0.72, 0.26);
        eye.scale.set(1, 0.82, 0.65);
        scaryFace.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), iris);
        pupil.position.set(x, 0.72, 0.37);
        scaryFace.add(pupil);
        const glint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        glint.position.set(x - 0.02, 0.76, 0.4);
        scaryFace.add(glint);
      });
      const maw = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x14000a })
      );
      maw.position.set(0, 0.42, 0.29);
      maw.scale.set(1.25, 0.9, 0.45);
      scaryFace.add(maw);
      const toothMat = new THREE.MeshBasicMaterial({ color: 0xfff5e2 });
      for (let i = 0; i < 6; i++) {
        const upper = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 4), toothMat);
        upper.position.set(-0.16 + i * 0.064, 0.5, 0.36);
        upper.rotation.z = Math.PI;
        scaryFace.add(upper);
        const lower = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), toothMat);
        lower.position.set(-0.14 + i * 0.056, 0.33, 0.36);
        scaryFace.add(lower);
      }
      const tongue = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4d7d })
      );
      tongue.position.set(0.02, 0.35, 0.38);
      tongue.scale.set(0.9, 0.35, 1.2);
      scaryFace.add(tongue);
      const spikes = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.22, 4),
        new THREE.MeshStandardMaterial({ color: 0x1a0a20, emissive: 0xff1845, emissiveIntensity: 0.8 })
      );
      spikes.position.set(0, 1.0, 0);
      spikes.rotation.z = 0.2;
      scaryFace.add(spikes);
      scaryFace.visible = false;
      group.add(scaryFace);

      const light = new THREE.PointLight(m.color, 3.2, 4.2, 2);
      light.position.set(0, 0.7, 0);
      group.add(light);

      scene.add(group);
      this.ghosts.push({ id, group, bodyMat, normalEyes, scaryFace, light });
    });

    // Stars and floating dust
    const starGeo = new THREE.BufferGeometry();
    const starCount = 700;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const palette = [new THREE.Color(0x8f7bff), new THREE.Color(0x5ce8ff), new THREE.Color(0xff6bd8)];
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = 2 + Math.random() * 26;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.75, toneMapped: false })
    );
    scene.add(stars);
    this.stars = stars;

    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 160;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = Math.random() * MAZE_W;
      dustPos[i * 3 + 1] = 0.2 + Math.random() * 1.6;
      dustPos[i * 3 + 2] = Math.random() * MAZE_H;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x9f8bff, size: 0.055, transparent: true, opacity: 0.55, toneMapped: false })
    );
    scene.add(dust);
    this.dust = dust;

    const el = renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    this.initialised = true;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.renderer?.domElement.setPointerCapture(e.pointerId);
    if (this.renderer) this.renderer.domElement.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.42, 1.38);
  };

  private onPointerUp = () => {
    this.dragging = false;
    if (this.renderer) this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = clamp(this.dist + e.deltaY * 0.014, 11, 30);
  };

  resize(width: number, height: number) {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  update(state: GameState, mode: "orbit" | "pov", time: number, dt: number) {
    if (!this.ok || !this.initialised || !this.renderer || !this.scene || !this.camera) return;
    const pacPos = posOf(state.pac);
    const dir = dirVector(state.pac.dir);

    // Pac transform
    if (this.pacGroup) {
      this.pacGroup.position.set(pacPos.x, 0.46 + Math.sin(time * 3.2) * 0.018, pacPos.y);
      const angle = state.pac.dir ? Math.atan2(-dir.y, dir.x) : 0;
      this.pacGroup.rotation.y = angle;
      const mouth = state.pac.moving ? 0.9 + Math.sin(state.pac.anim * 14) * 0.12 : 1;
      this.pacGroup.scale.set(1, mouth, 1);
      this.pacGroup.visible = mode === "orbit" && state.status !== "dying";
    }

    // Pellet instances
    if (this.pellets && this.powerPellets) {
      const m = new THREE.Matrix4();
      this.pelletKeys.forEach((key, i) => {
        const [x, y] = key.split(",").map(Number);
        if (state.pellets.has(key)) {
          m.makeTranslation(x, 0.2 + Math.sin(time * 2 + x) * 0.028, y);
        } else {
          m.makeScale(0, 0, 0);
        }
        this.pellets!.setMatrixAt(i, m);
      });
      this.pellets.instanceMatrix.needsUpdate = true;
      const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, time * 1.6, 0.15));
      const unit = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      this.powerKeys.forEach((key, i) => {
        const [x, y] = key.split(",").map(Number);
        if (state.pellets.has(key)) {
          const s = 0.9 + Math.sin(time * 4 + x) * 0.2;
          pos.set(x, 0.3, y);
          unit.set(s, s, s);
          m.compose(pos, spin, unit);
        } else {
          m.makeScale(0, 0, 0);
        }
        this.powerPellets!.setMatrixAt(i, m);
      });
      this.powerPellets.instanceMatrix.needsUpdate = true;
    }


    // Ghosts
    const nearest = state.ghosts
      .filter((g) => g.mode === "out")
      .map((g) => ({ g, d: Math.hypot(posOf(g).x - pacPos.x, posOf(g).y - pacPos.y) }))
      .sort((a, b) => a.d - b.d)[0];

    state.ghosts.forEach((g, i) => {
      const rig = this.ghosts[i];
      if (!rig) return;
      const gp = posOf(g);
      rig.group.visible = g.mode !== "eaten";
      let gx = gp.x;
      let gz = gp.y;
      let scale = 1;
      const distToPac = Math.hypot(gx - pacPos.x, gz - pacPos.y);
      const pov = mode === "pov";
      const scary = pov ? distToPac < 3.4 : state.status === "dying" && nearest?.g.id === g.id;
      let floating = 0.1 + Math.sin(time * 2.2 + i * 1.5) * 0.05;

      if (state.status === "dying" && nearest?.g.id === g.id) {
        const progress = clamp(1 - state.stateTimer / 1.85, 0, 1);
        const ease = progress * progress;
        gx = gx + (pacPos.x - gx) * ease * 0.82;
        gz = gz + (pacPos.y - gz) * ease * 0.82;
        floating = 0.3 + ease * 0.32;
        scale = 1 + ease * 1.15;
      } else if (pov) {
        scale = 1 + clamp(1 - distToPac / 3.4, 0, 1) * 0.8;
        floating = 0.12;
      }

      rig.group.position.set(gx, floating, gz);
      rig.group.scale.setScalar(scale);
      rig.group.rotation.y = Math.atan2(pacPos.x - gx, pacPos.y - gz);

      const frightened = g.frightened && g.mode === "out";
      if (frightened) {
        rig.bodyMat.color.setHex(0x2b3cff);
        rig.bodyMat.emissive.setHex(0x394dff);
        rig.bodyMat.emissiveIntensity = 0.9 + Math.sin(time * 12) * 0.3;
        rig.scaryFace.visible = false;
        rig.normalEyes.visible = true;
        rig.light.color.setHex(0x3b54ff);
        rig.light.intensity = 2;
      } else {
        rig.bodyMat.color.set(g.color);
        rig.bodyMat.emissive.set(g.color);
        rig.bodyMat.emissiveIntensity = scary ? 1.25 : 0.5;
        rig.scaryFace.visible = scary;
        rig.normalEyes.visible = !scary;
        rig.light.color.set(g.color);
        rig.light.intensity = scary ? 10 : 3.2;
      }
    });

    // Red emergency lighting for panic cam
    if (this.redLight) {
      this.redLight.intensity = mode === "pov" ? 9 + state.danger * 26 : state.danger * 5;
      const target = nearest?.g;
      if (target) {
        const gp = posOf(target);
        this.redLight.position.set(gp.x, 0.9, gp.y);
      }
    }
    if (this.fog) {
      this.fog.color.setHex(mode === "pov" ? 0x190510 : 0x0b0620);
      this.fog.density = mode === "pov" ? 0.05 + state.danger * 0.035 : 0.024;
    }

    // Camera
    const camera = this.camera;
    const prevFov = camera.fov;
    if (mode === "pov") {
      const fwd = state.pac.dir ? dirVector(state.pac.dir) : { x: 0, y: -1 };
      let lookX = fwd.x;
      let lookZ = fwd.y;
      // In a crunch, let the camera glance toward the specter — and fully face it on contact.
      if (nearest && (!nearest.g.frightened || state.status === "dying")) {
        const gp = posOf(nearest.g);
        const dx = gp.x - pacPos.x;
        const dz = gp.y - pacPos.y;
        const len = Math.hypot(dx, dz) || 1;
        if (state.status === "dying") {
          lookX = dx / len;
          lookZ = dz / len;
        } else if (nearest.d < 3.1) {
          const dot = (fwd.x * dx + fwd.y * dz) / len;
          const cross = (fwd.x * dz - fwd.y * dx) / len;
          // Near miss: keep the escape route in view, then whip toward what is about to bite.
          const grasp = Math.max(0, Math.min(1, (1.95 - nearest.d) / 1.0));
          const turn = Math.atan2(cross, dot) * grasp * 0.95;
          lookX = fwd.x * Math.cos(turn) - fwd.y * Math.sin(turn);
          lookZ = fwd.x * Math.sin(turn) + fwd.y * Math.cos(turn);
        }
      }
      const eye = new THREE.Vector3(pacPos.x + fwd.x * 0.08, 0.62 + Math.sin(time * 4.1) * 0.012, pacPos.y + fwd.y * 0.08);
      camera.position.lerp(eye, 1 - Math.exp(-dt * 26));
      const look = new THREE.Vector3(
        pacPos.x + lookX * 3.2,
        0.55 + Math.sin(time * 2.3) * 0.03,
        pacPos.y + lookZ * 3.2
      );
      this.camLook.lerp(look, 1 - Math.exp(-dt * 20));
      camera.lookAt(this.camLook);
      camera.fov = 72 + state.danger * 12;
      const rumble = (state.danger * 0.012 + state.shake * 0.03) * (state.status === "playing" ? 1 : 0.6);
      camera.position.x += (Math.random() - 0.5) * rumble;
      camera.position.y += (Math.random() - 0.5) * rumble;
      camera.rotateZ(Math.sin(time * 17) * rumble * 0.5 + state.danger * Math.sin(time * 3) * 0.014);
    } else if (state.status === "idle") {
      const center = new THREE.Vector3(MAZE_W / 2 - 0.5, 0.8, MAZE_H / 2 - 0.5);
      const idleYaw = time * 0.14 + 0.3;
      const desired = new THREE.Vector3(
        center.x + Math.sin(idleYaw) * 16,
        18,
        center.z + Math.cos(idleYaw) * 16
      );
      camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
      this.camLook.lerp(center, 1 - Math.exp(-dt * 4));
      camera.lookAt(this.camLook);
      camera.fov = 55;
    } else {
      const look = new THREE.Vector3(pacPos.x, 0.35, pacPos.y);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 5));
      const height = Math.sin(this.pitch) * this.dist;
      const flat = Math.cos(this.pitch) * this.dist;
      const desired = new THREE.Vector3(
        this.camLook.x + Math.sin(this.yaw) * flat,
        height,
        this.camLook.z + Math.cos(this.yaw) * flat
      );
      camera.position.lerp(desired, 1 - Math.exp(-dt * 3.4));
      camera.lookAt(this.camLook);
      camera.fov = 54;
    }
    if (Math.abs(prevFov - camera.fov) > 0.01) camera.updateProjectionMatrix();

    if (this.stars) this.stars.rotation.y = time * 0.008;
    if (this.dust) {
      this.dust.rotation.y = time * 0.015;
      this.dust.position.y = Math.sin(time * 0.6) * 0.05;
    }
    if (this.pacLight) {
      this.pacLight.intensity = state.powerTimer > 0 ? 26 : 14;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const el = this.renderer?.domElement;
    if (el) {
      el.removeEventListener("pointerdown", this.onPointerDown);
      el.removeEventListener("pointermove", this.onPointerMove);
      el.removeEventListener("pointerup", this.onPointerUp);
      el.removeEventListener("pointerleave", this.onPointerUp);
      el.removeEventListener("wheel", this.onWheel);
      el.remove();
    }
    if (this.scene) {
      this.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    }
    this.renderer?.dispose();
    this.renderer = undefined;
  }
}
