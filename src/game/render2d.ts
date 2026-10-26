import { MAZE_H, MAZE_W, tileAt } from "./maze";
import { dirVector, posOf, type GameState } from "./engine";

const TAU = Math.PI * 2;

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export class Render2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private trail: { x: number; y: number; life: number; color: string }[] = [];
  private trailClock = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = width;
    this.h = height;
  }

  private metrics() {
    const pad = Math.min(26, Math.max(10, this.w * 0.025));
    const tile = Math.min((this.w - pad * 2) / MAZE_W, (this.h - pad * 2) / MAZE_H);
    return {
      tile,
      ox: (this.w - MAZE_W * tile) / 2,
      oy: (this.h - MAZE_H * tile) / 2,
    };
  }

  draw(state: GameState, time: number, dt: number) {
    const ctx = this.ctx;
    const { tile, ox, oy } = this.metrics();
    const cx = (tx: number) => ox + (tx + 0.5) * tile;
    const cy = (ty: number) => oy + (ty + 0.5) * tile;
    const pac = posOf(state.pac);

    // backdrop
    ctx.clearRect(0, 0, this.w, this.h);
    const bg = ctx.createRadialGradient(this.w / 2, this.h / 2, 20, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    bg.addColorStop(0, "#100b24");
    bg.addColorStop(0.55, "#090714");
    bg.addColorStop(1, "#05040b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // fine grid
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#241c4d";
    ctx.lineWidth = 1;
    for (let x = ox % (tile * 2); x < this.w; x += tile * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    for (let y = oy % (tile * 2); y < this.h; y += tile * 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // maze floor wells
    ctx.save();
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W; x++) {
        const t = tileAt(x, y);
        if (t === "#" || t === "=") continue;
        ctx.fillStyle = t === "G" ? "rgba(255,70,150,0.05)" : "rgba(108,86,255,0.035)";
        roundedRect(ctx, ox + x * tile + 1, oy + y * tile + 1, tile - 2, tile - 2, Math.max(2, tile * 0.18));
        ctx.fill();
      }
    }
    ctx.restore();

    // wall bodies
    ctx.save();
    const wallGrad = ctx.createLinearGradient(0, oy, 0, oy + MAZE_H * tile);
    wallGrad.addColorStop(0, "#1a1140");
    wallGrad.addColorStop(0.5, "#150e35");
    wallGrad.addColorStop(1, "#1b1144");
    ctx.fillStyle = wallGrad;
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W; x++) {
        if (tileAt(x, y) !== "#") continue;
        roundedRect(ctx, ox + x * tile + 0.5, oy + y * tile + 0.5, tile - 1, tile - 1, Math.max(2, tile * 0.16));
        ctx.fill();
      }
    }

    // exposed neon edges
    const edge = (color: string, width: number, blur: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      for (let y = 0; y < MAZE_H; y++) {
        for (let x = 0; x < MAZE_W; x++) {
          if (tileAt(x, y) !== "#") continue;
          const px = ox + x * tile;
          const py = oy + y * tile;
          const inset = Math.max(1.5, tile * 0.1);
          if (tileAt(x, y - 1) !== "#") {
            ctx.moveTo(px + inset, py + inset);
            ctx.lineTo(px + tile - inset, py + inset);
          }
          if (tileAt(x, y + 1) !== "#") {
            ctx.moveTo(px + inset, py + tile - inset);
            ctx.lineTo(px + tile - inset, py + tile - inset);
          }
          if (tileAt(x - 1, y) !== "#") {
            ctx.moveTo(px + inset, py + inset);
            ctx.lineTo(px + inset, py + tile - inset);
          }
          if (tileAt(x + 1, y) !== "#") {
            ctx.moveTo(px + tile - inset, py + inset);
            ctx.lineTo(px + tile - inset, py + tile - inset);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    };
    edge("#5b4bff", Math.max(1.2, tile * 0.07), 14, 0.45);
    edge("#b6acff", Math.max(0.8, tile * 0.035), 5, 0.85);

    // ghost house door
    ctx.save();
    ctx.strokeStyle = "#ff5fa2";
    ctx.shadowColor = "#ff5fa2";
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(2, tile * 0.12);
    ctx.beginPath();
    ctx.moveTo(ox + 8.62 * tile, oy + 8.5 * tile);
    ctx.lineTo(ox + 10.38 * tile, oy + 8.5 * tile);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // pellets — normal dots are batched into a single glowing pass
    const dotR = Math.max(1.2, tile * 0.058);
    ctx.save();
    ctx.shadowColor = "rgba(255,214,90,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "rgba(255,227,145,0.95)";
    ctx.beginPath();
    for (const key of state.pellets) {
      const [px, py] = key.split(",").map(Number);
      if (tileAt(px, py) === "o") continue;
      const x = cx(px);
      const y = cy(py);
      ctx.moveTo(x + dotR, y);
      ctx.arc(x, y, dotR, 0, TAU);
    }
    ctx.fill();
    ctx.restore();

    for (const key of state.pellets) {
      const [px, py] = key.split(",").map(Number);
      if (tileAt(px, py) !== "o") continue;
      const x = cx(px);
      const y = cy(py);
      const pulse = 0.65 + Math.sin(time * 4 + px) * 0.25;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 1.2);
      ctx.shadowColor = "#ffd83d";
      ctx.shadowBlur = 22 * pulse;
      ctx.fillStyle = "#ffe66a";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? tile * 0.21 : tile * 0.115;
        const a = (i / 8) * TAU;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,230,120,0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, tile * (0.3 + pulse * 0.07), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // pac trail
    this.trailClock += dt;
    if (this.trailClock > 0.028 && state.status === "playing") {
      this.trailClock = 0;
      const v = dirVector(state.pac.dir);
      this.trail.push({ x: cx(pac.x) - v.x * tile * 0.2, y: cy(pac.y) - v.y * tile * 0.2, life: 0.34, color: "#ffe14d" });
      if (this.trail.length > 34) this.trail.shift();
    }
    this.trail.forEach((p) => {
      p.life -= dt;
      if (p.life > 0) {
        ctx.globalAlpha = (p.life / 0.34) * 0.2;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, tile * 0.35 * (p.life / 0.34), 0, TAU);
        ctx.fill();
      }
    });
    this.trail = this.trail.filter((p) => p.life > 0);
    ctx.globalAlpha = 1;

    // ghosts
    state.ghosts.forEach((g) => {
      if (g.mode === "eaten") return;
      const p = posOf(g);
      const gx = cx(p.x);
      const gy = cy(p.y) + Math.sin(time * 2.4 + g.bob) * tile * 0.055;
      const r = tile * 0.39;
      const frightened = g.frightened || state.powerTimer > 0;
      const color = frightened ? (state.powerTimer < 2.2 && Math.floor(time * 8) % 2 ? "#f4f1ff" : "#3340ff") : g.color;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = frightened ? 10 : 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(gx, gy - r * 0.15, r, Math.PI, 0);
      ctx.lineTo(gx + r, gy + r * 0.75);
      const teeth = 4;
      for (let i = teeth; i > 0; i--) {
        const x1 = gx + r - (i * 2 * r) / teeth;
        const x2 = x1 + r / teeth;
        ctx.lineTo(x2, gy + r * 0.52);
        ctx.lineTo(x1, gy + r * 0.8);
      }
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      if (frightened) {
        ctx.fillStyle = "#cfe4ff";
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.arc(gx + s * r * 0.35, gy - r * 0.22, r * 0.13, 0, TAU);
          ctx.fill();
        });
        ctx.strokeStyle = "#cfe4ff";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const wx = gx - r * 0.45 + (i / 5) * r * 0.9;
          const wy = gy + r * 0.28 + (i % 2 === 0 ? 0 : r * 0.12);
          ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = "#f7f5ff";
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.ellipse(gx + s * r * 0.34, gy - r * 0.18, r * 0.24, r * 0.28, 0, 0, TAU);
          ctx.fill();
        });
        const pv = dirVector(state.pac.dir);
        const dx = pac.x > p.x ? 1 : -1;
        const dy = pac.y > p.y ? 1 : -1;
        ctx.fillStyle = "#1a1030";
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.arc(gx + s * r * 0.34 + dx * r * 0.11, gy - r * 0.18 + dy * r * 0.08 + pv.y * r * 0.05, r * 0.115, 0, TAU);
          ctx.fill();
        });
        if (state.danger > 0.6) {
          ctx.strokeStyle = "rgba(255,60,90,0.9)";
          ctx.lineWidth = Math.max(1, tile * 0.04);
          ctx.beginPath();
          ctx.moveTo(gx - r * 0.28, gy + r * 0.32);
          for (let i = 1; i <= 4; i++) {
            ctx.lineTo(gx - r * 0.28 + (i * r * 0.56) / 4, gy + r * 0.32 + (i % 2 === 0 ? 0 : r * 0.1));
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      if (tile > 19) {
        ctx.save();
        ctx.font = `600 ${Math.max(7, tile * 0.24)}px "Chakra Petch", monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.42)";
        ctx.fillText(g.name, gx, gy - r * 2.05);
        ctx.restore();
      }
    });

    // pac man
    if (state.status !== "dying" || state.stateTimer > 0.55) {
      const pr = tile * 0.46;
      const moving = Math.abs(state.pac.t) > 0.001 || state.pac.moving;
      const chomp = moving ? 0.06 + Math.abs(Math.sin(state.pac.anim * 13)) * 0.62 : 0.3;
      const angleByDir: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      const angle = angleByDir[state.pac.dir ?? "right"] ?? 0;
      const px = cx(pac.x);
      const py = cy(pac.y);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.shadowColor = "#ffe14d";
      ctx.shadowBlur = 24;
      const grad = ctx.createRadialGradient(-pr * 0.2, -pr * 0.25, pr * 0.1, 0, 0, pr);
      grad.addColorStop(0, "#fff4a6");
      grad.addColorStop(0.55, "#ffdf3d");
      grad.addColorStop(1, "#ffb400");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, pr, chomp / 2, TAU - chomp / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#241536";
      ctx.beginPath();
      ctx.arc(pr * 0.06, -pr * 0.46, Math.max(1.3, pr * 0.11), 0, TAU);
      ctx.fill();
      ctx.restore();

      if (state.powerTimer > 0) {
        ctx.save();
        ctx.strokeStyle = "#ffe14d";
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = Math.max(1.5, tile * 0.07);
        ctx.setLineDash([tile * 0.16, tile * 0.16]);
        ctx.beginPath();
        ctx.arc(px, py, pr * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * (state.powerTimer / 8));
        ctx.stroke();
        ctx.restore();
      }
    }

    // popups
    state.popups.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.fillStyle = p.color;
      ctx.font = `700 ${Math.max(10, tile * 0.32)}px "Chakra Petch", monospace`;
      ctx.textAlign = "center";
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillText(p.text, cx(p.x), cy(p.y) - (1.3 - p.life) * tile * 1.2);
      ctx.restore();
    });

    // danger vignette
    if (state.danger > 0.05) {
      const grd = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.28, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      grd.addColorStop(0, "rgba(255,20,70,0)");
      grd.addColorStop(1, `rgba(255,20,70,${0.32 * state.danger})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // gutter labels
    const gutterLeft = ox / 2;
    const gutterRight = ox + MAZE_W * tile + (this.w - (ox + MAZE_W * tile)) / 2;
    if (ox > 90) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.26)";
      ctx.font = '600 10px "Chakra Petch", monospace';
      ctx.textAlign = "center";
      ctx.save();
      ctx.translate(gutterLeft, this.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("S E C T O R   0 7   //   N I G H T   S H I F T", 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(gutterRight, this.h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`S P E C T E R S   ${state.ghosts.filter((g) => g.mode === "out").length} / 4`, 0, 0);
      ctx.restore();
      ctx.restore();
    }
  }
}
