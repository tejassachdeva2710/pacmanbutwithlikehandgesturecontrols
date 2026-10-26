import {
  ALL_DIRS,
  canWalk,
  DIRS,
  GHOST_HOME,
  HOUSE_EXIT,
  initialPellets,
  OPPOSITE,
  PAC_START,
  SCATTER_CORNERS,
  tileAt,
  type Dir,
} from "./maze";

export type GameStatus = "idle" | "playing" | "paused" | "dying" | "levelclear" | "gameover";
export type GameEvent = "chomp" | "power" | "ghost" | "death" | "level" | "start" | "extra" | "ui";
export type ViewMode = "2d" | "3d" | "pov";

export interface Point {
  x: number;
  y: number;
}

interface Mover {
  tile: Point;
  next: Point;
  t: number;
  dir: Dir | null;
  moving: boolean;
  speed: number;
}

export interface Pac extends Mover {
  pending: Dir | null;
  anim: number;
}

export interface Ghost extends Mover {
  id: number;
  name: string;
  role: string;
  color: string;
  mode: "house" | "out" | "eaten";
  frightened: boolean;
  releaseTimer: number;
  respawnTimer: number;
  bob: number;
}

export interface Popup {
  id: number;
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export interface GameState {
  status: GameStatus;
  score: number;
  high: number;
  lives: number;
  level: number;
  pac: Pac;
  ghosts: Ghost[];
  pellets: Set<string>;
  totalPellets: number;
  powerTimer: number;
  ghostCombo: number;
  mode: "scatter" | "chase";
  modeTimer: number;
  elapsed: number;
  danger: number;
  nearest: number;
  threat: number;
  events: GameEvent[];
  flash: number;
  shake: number;
  stateTimer: number;
  levelPelletsEaten: number;
  popups: Popup[];
  lastGhost: string;
}

const GHOST_META = [
  { name: "BLINK", role: "THE STALKER", color: "#ff3358" },
  { name: "VEX", role: "THE AMBUSHER", color: "#ff63d8" },
  { name: "WRAITH", role: "THE FLANKER", color: "#2ee6ff" },
  { name: "HEX", role: "THE WILDCARD", color: "#ffab35" },
];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

const pacSpeedFor = (level: number) => Math.min(7.4, 5.5 + level * 0.14);
const ghostSpeedFor = (level: number) => Math.min(7.1, 4.5 + level * 0.16);

const freshMover = (x: number, y: number, speed: number): Mover => ({
  tile: { x, y },
  next: { x, y },
  t: 0,
  dir: null,
  moving: false,
  speed,
});

export const posOf = (m: Mover): Point => ({
  x: m.tile.x + (m.next.x - m.tile.x) * m.t,
  y: m.tile.y + (m.next.y - m.tile.y) * m.t,
});

export const dirVector = (dir: Dir | null): Point => (dir ? DIRS[dir] : { x: 0, y: 0 });

export class GameEngine {
  state: GameState;
  private popupId = 1;

  constructor() {
    let high = 0;
    try {
      high = Number(localStorage.getItem("neonchomp.high") || 0);
    } catch {
      high = 0;
    }
    this.state = this.makeState(Number.isFinite(high) ? high : 0);
  }

  private makeState(high: number): GameState {
    const { pellets, total } = initialPellets();
    const pac: Pac = {
      ...freshMover(PAC_START.x, PAC_START.y, pacSpeedFor(1)),
      pending: null,
      anim: 0,
    };
    const ghosts: Ghost[] = GHOST_META.map((meta, i) => ({
      ...freshMover(i === 0 ? HOUSE_EXIT.x : GHOST_HOME[i].x, i === 0 ? HOUSE_EXIT.y : GHOST_HOME[i].y, ghostSpeedFor(1)),
      ...meta,
      id: i,
      mode: i === 0 ? "out" : "house",
      frightened: false,
      releaseTimer: i === 0 ? 0 : 1 + i * 2.4,
      respawnTimer: 0,
      bob: i * 1.7,
    }));

    return {
      status: "idle",
      score: 0,
      high,
      lives: 3,
      level: 1,
      pac,
      ghosts,
      pellets,
      totalPellets: total,
      powerTimer: 0,
      ghostCombo: 1,
      mode: "scatter",
      modeTimer: 6,
      elapsed: 0,
      danger: 0,
      nearest: 20,
      threat: 20,
      events: [],
      flash: 0,
      shake: 0,
      stateTimer: 0,
      levelPelletsEaten: 0,
      popups: [],
      lastGhost: "",
    };
  }

  start() {
    const high = this.state.high;
    this.state = this.makeState(high);
    this.state.status = "playing";
    this.state.events.push("start");
    this.consumeAt(this.state.pac.tile.x, this.state.pac.tile.y);
    this.computeDanger();
  }

  restart() {
    this.start();
  }

  drainEvents() {
    const events = this.state.events;
    this.state.events = [];
    return events;
  }

  setDirection(dir: Dir) {
    if (this.state.status === "idle") return;
    this.state.pac.pending = dir;
  }

  togglePause() {
    const s = this.state;
    if (s.status === "playing") s.status = "paused";
    else if (s.status === "paused") s.status = "playing";
  }

  step(dt: number) {
    const s = this.state;
    const delta = Math.min(dt, 0.048);
    s.flash = Math.max(0, s.flash - delta * 2.6);
    s.shake = Math.max(0, s.shake - delta * 2.2);
    s.popups = s.popups.filter((p) => {
      p.life -= delta;
      return p.life > 0;
    });

    if (s.status === "dying") {
      s.stateTimer -= delta;
      if (s.stateTimer <= 0) this.afterDeath();
      return;
    }
    if (s.status === "levelclear") {
      s.stateTimer -= delta;
      if (s.stateTimer <= 0) this.beginLevel(s.level + 1);
      return;
    }
    if (s.status !== "playing") return;

    s.elapsed += delta;
    s.pac.anim += delta;

    if (s.powerTimer > 0) {
      s.powerTimer = Math.max(0, s.powerTimer - delta);
      if (s.powerTimer === 0) {
        s.ghostCombo = 1;
        s.ghosts.forEach((g) => {
          g.frightened = false;
          g.speed = ghostSpeedFor(s.level);
        });
      }
    }

    s.modeTimer -= delta;
    if (s.modeTimer <= 0) {
      if (s.mode === "scatter") {
        s.mode = "chase";
        s.modeTimer = Math.max(9, 21 - s.level);
      } else {
        s.mode = "scatter";
        s.modeTimer = Math.max(3.5, 7 - s.level * 0.4);
      }
    }

    this.updatePac(delta);
    if (s.status !== "playing") {
      this.computeDanger();
      return;
    }
    this.updateGhosts(delta);
    this.checkCollisions();
    this.computeDanger();

    if (s.score > s.high) {
      s.high = s.score;
      try {
        localStorage.setItem("neonchomp.high", String(s.high));
      } catch {
        /* ignore */
      }
    }
  }

  private updatePac(dt: number) {
    const s = this.state;
    const p = s.pac;
    p.speed = pacSpeedFor(s.level);

    // Responsive instant reversal.
    if (p.moving && p.pending && p.dir && p.pending === OPPOSITE[p.dir]) {
      const oldTile = p.tile;
      p.tile = p.next;
      p.next = oldTile;
      p.t = 1 - p.t;
      p.dir = p.pending;
      p.pending = null;
    }

    if (!p.moving) this.beginPacMove();

    if (!p.moving) return;

    p.t += p.speed * dt;

    while (p.t >= 1) {
      const arrived = p.next;
      p.tile = arrived;
      p.t -= 1;
      p.moving = false;
      this.consumeAt(arrived.x, arrived.y);
      if (s.status !== "playing") {
        p.t = 0;
        return;
      }
      this.beginPacMove();
      if (!p.moving) {
        p.t = 0;
        break;
      }
    }
  }

  private beginPacMove() {
    const p = this.state.pac;
    const tryDir = (dir: Dir | null) => {
      if (!dir) return false;
      const v = DIRS[dir];
      if (!canWalk(p.tile.x + v.x, p.tile.y + v.y, false)) return false;
      p.next = { x: p.tile.x + v.x, y: p.tile.y + v.y };
      p.dir = dir;
      p.moving = true;
      return true;
    };
    if (tryDir(p.pending)) {
      p.pending = null;
      return;
    }
    if (tryDir(p.dir)) return;
    p.next = { ...p.tile };
    p.t = 0;
    p.moving = false;
  }

  private updateGhosts(dt: number) {
    const s = this.state;
    s.ghosts.forEach((g) => {
      g.bob += dt;

      if (g.mode === "house") {
        g.releaseTimer -= dt;
        if (g.releaseTimer <= 0) {
          g.mode = "out";
          g.tile = { ...HOUSE_EXIT };
          g.next = { ...HOUSE_EXIT };
          g.t = 0;
          g.moving = false;
          g.dir = null;
          this.chooseGhostDir(g);
        }
        return;
      }

      if (g.mode === "eaten") {
        g.respawnTimer -= dt;
        if (g.respawnTimer <= 0) {
          g.mode = "out";
          g.tile = { ...HOUSE_EXIT };
          g.next = { ...HOUSE_EXIT };
          g.t = 0;
          g.moving = false;
          g.dir = null;
          g.frightened = false;
          g.speed = ghostSpeedFor(s.level);
          this.chooseGhostDir(g);
        }
        return;
      }

      g.speed = g.frightened ? ghostSpeedFor(s.level) * 0.62 : ghostSpeedFor(s.level);
      if (!g.moving) this.chooseGhostDir(g);
      if (!g.moving) return;
      g.t += g.speed * dt;

      while (g.t >= 1) {
        const arrived = g.next;
        g.tile = arrived;
        g.t -= 1;
        g.moving = false;
        this.chooseGhostDir(g);
        if (!g.moving) {
          g.t = 0;
          break;
        }
      }
    });
  }

  private ghostTarget(g: Ghost): Point {
    const s = this.state;
    const pac = s.pac;
    const pv = dirVector(pac.dir);
    if (g.frightened) return { x: 0, y: s.level % 2 === 0 ? 0 : 19 };
    if (s.mode === "scatter") return SCATTER_CORNERS[g.id];
    switch (g.id) {
      case 0:
        return { ...pac.tile };
      case 1:
        return { x: pac.tile.x + pv.x * 4, y: pac.tile.y + pv.y * 4 };
      case 2: {
        const blinky = s.ghosts[0];
        const ahead = { x: pac.tile.x + pv.x * 2, y: pac.tile.y + pv.y * 2 };
        return { x: ahead.x * 2 - blinky.tile.x, y: ahead.y * 2 - blinky.tile.y };
      }
      default: {
        const d = Math.hypot(pac.tile.x - g.tile.x, pac.tile.y - g.tile.y);
        return d > 8 ? { ...pac.tile } : SCATTER_CORNERS[3];
      }
    }
  }

  private chooseGhostDir(g: Ghost) {
    const options = ALL_DIRS.filter((dir) => {
      const v = DIRS[dir];
      const nx = g.tile.x + v.x;
      const ny = g.tile.y + v.y;
      if (!canWalk(nx, ny, true)) return false;
      if (tileAt(nx, ny) === "=" || tileAt(nx, ny) === "G") return false;
      if (g.dir && dir === OPPOSITE[g.dir]) return false;
      return true;
    });

    const usable = options.length
      ? options
      : ALL_DIRS.filter((dir) => {
          const v = DIRS[dir];
          return canWalk(g.tile.x + v.x, g.tile.y + v.y, true) && tileAt(g.tile.x + v.x, g.tile.y + v.y) !== "=";
        });

    if (!usable.length) {
      g.moving = false;
      return;
    }

    let chosen: Dir;
    if (g.frightened) {
      chosen = usable[Math.floor(Math.random() * usable.length)];
    } else {
      const target = this.ghostTarget(g);
      let best = Infinity;
      chosen = usable[0];
      usable.forEach((dir) => {
        const v = DIRS[dir];
        const nx = g.tile.x + v.x;
        const ny = g.tile.y + v.y;
        const dist = Math.hypot(nx - target.x, ny - target.y) + Math.random() * 0.01;
        if (dist < best) {
          best = dist;
          chosen = dir;
        }
      });
    }

    const v = DIRS[chosen];
    g.dir = chosen;
    g.next = { x: g.tile.x + v.x, y: g.tile.y + v.y };
    g.moving = true;
  }

  private consumeAt(x: number, y: number) {
    const s = this.state;
    const key = `${x},${y}`;
    if (!s.pellets.delete(key)) return;
    s.levelPelletsEaten++;
    s.score += 10;
    s.events.push("chomp");

    if (tileAt(x, y) === "o") {
      s.powerTimer = 8;
      s.ghostCombo = 1;
      s.flash = 1;
      s.events.push("power");
      this.addPopup(x, y, "POWER", "#ffd83d");
      s.ghosts.forEach((g) => {
        if (g.mode === "eaten") return;
        g.frightened = true;
        if (g.mode === "out") {
          g.speed *= 0.62;
          if (g.moving) {
            const old = g.tile;
            g.tile = g.next;
            g.next = old;
            g.t = 1 - g.t;
            g.dir = g.dir ? OPPOSITE[g.dir] : null;
          }
        }
      });
    }

    if (s.pellets.size === 0) {
      s.status = "levelclear";
      s.stateTimer = 2.6;
      s.score += 500 + s.level * 100;
      s.events.push("level");
    }
  }

  private checkCollisions() {
    const s = this.state;
    const pacPos = posOf(s.pac);
    for (const g of s.ghosts) {
      if (g.mode !== "out") continue;
      const gp = posOf(g);
      const dist = Math.hypot(gp.x - pacPos.x, gp.y - pacPos.y);
      if (dist > 0.72) continue;

      if (g.frightened) {
        const value = 200 * s.ghostCombo;
        s.score += value;
        s.ghostCombo = Math.min(4, s.ghostCombo * 2);
        s.lastGhost = g.name;
        g.mode = "eaten";
        g.respawnTimer = 2.4;
        g.frightened = false;
        s.flash = 0.7;
        s.shake = 0.35;
        s.events.push("ghost");
        this.addPopup(gp.x, gp.y, `+${value}`, "#8bffd5");
      } else if (g.mode === "out") {
        s.status = "dying";
        s.stateTimer = 1.85;
        s.shake = 1;
        s.flash = 1;
        s.events.push("death");
        s.lastGhost = g.name;
        g.frightened = false;
        return;
      }
    }
  }

  private addPopup(x: number, y: number, text: string, color: string) {
    this.state.popups.push({ id: this.popupId++, text, x, y, life: 1.3, color });
  }

  private computeDanger() {
    const s = this.state;
    const pacPos = posOf(s.pac);
    let threat = 30;
    let nearest = 30;
    s.ghosts.forEach((g) => {
      if (g.mode !== "out") return;
      const gp = posOf(g);
      const d = Math.hypot(gp.x - pacPos.x, gp.y - pacPos.y);
      nearest = Math.min(nearest, d);
      if (!g.frightened) threat = Math.min(threat, d);
    });
    s.nearest = nearest;
    s.threat = threat;
    s.danger = clamp(1 - (threat - 0.4) / 4.2, 0, 1);
  }

  private afterDeath() {
    const s = this.state;
    s.lives -= 1;
    if (s.lives <= 0) {
      s.status = "gameover";
      s.events.push("ui");
      try {
        localStorage.setItem("neonchomp.high", String(s.high));
      } catch {
        /* ignore */
      }
      return;
    }
    s.status = "playing";
    s.powerTimer = 0;
    s.ghostCombo = 1;
    s.mode = "scatter";
    s.modeTimer = 5;
    this.resetActors();
  }

  private resetActors() {
    const s = this.state;
    s.pac = {
      ...freshMover(PAC_START.x, PAC_START.y, pacSpeedFor(s.level)),
      pending: null,
      anim: 0,
    };
    s.ghosts.forEach((g, i) => {
      g.tile = i === 0 ? { ...HOUSE_EXIT } : { ...GHOST_HOME[i] };
      g.next = { ...g.tile };
      g.t = 0;
      g.dir = null;
      g.moving = false;
      g.mode = i === 0 ? "out" : "house";
      g.frightened = false;
      g.releaseTimer = i === 0 ? 0 : 1.2 + i * 2;
      g.respawnTimer = 0;
    });
    s.danger = 0;
    s.threat = 30;
  }

  private beginLevel(level: number) {
    const s = this.state;
    const { pellets, total } = initialPellets();
    s.level = level;
    s.pellets = pellets;
    s.totalPellets = total;
    s.levelPelletsEaten = 0;
    s.status = "playing";
    s.stateTimer = 0;
    s.mode = "scatter";
    s.modeTimer = 5;
    s.ghostCombo = 1;
    s.powerTimer = 0;
    s.events.push("start");
    this.resetActors();
    this.consumeAt(s.pac.tile.x, s.pac.tile.y);
  }
}
