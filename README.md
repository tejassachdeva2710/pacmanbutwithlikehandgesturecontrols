# 🦾 NEONCHOMP // Iron Man Gesture 3D Pac-Man

> An arcade-grade, cyberpunk-infused 3D Pac-Man built with **React 19**, **Three.js**, **MediaPipe Computer Vision**, and **Tailwind CSS v4**. Featuring mid-air **Iron Man hand-tracking gestures**, a dynamic **first-person panic camera**, authentic **arcade ghost AI**, and pure **procedural Web Audio API sound synthesis**.

---

## 🎮 Highlights

- **🦾 Iron Man Gesture Core (MediaPipe Tasks Vision)**:
  - Steer Pac-Man in mid-air using your webcam! Point your index finger or steer with hand motion (`Up`, `Down`, `Left`, `Right`).
  - **Fist Clench (✊)**: Instant Emergency Brake / Pause.
  - **Pinch Gesture (🤏)**: Tactical switch into first-person POV.
  - **Hologram HUD PiP**: Floating glassmorphic picture-in-picture viewport rendering your mirrored hand skeleton in glowing cyan and gold neon nodes with targeting reticles, scanlines, and real-time sensor telemetry.
- **🎥 Tri-Perspective Rendering Engine**:
  - **3D Isometric Orbit View**: Dynamic Three.js arena with instanced pellet geometry, volumetric fog, dynamic point lights, and atmospheric star/dust fields.
  - **First-Person Panic Camera (Auto-POV)**: Drops directly into Pac-Man's eyes when any hostile ghost breaches within **2.8 tiles** with cockpit threat telemetry and heartbeat pulse audio.
  - **Retro-Neon 2D Canvas Fallback**: Seamless real-time toggle (<kbd>V</kbd>) into a high-contrast 2D neon vector arena.
- **👻 Authentic Arcade Ghost AI**:
  - **Blinky (The Stalker)**: Aggressively hunts Pac-Man's exact tile.
  - **Vex / Pinky (The Ambusher)**: Predicts and ambushes 4 tiles ahead in Pac-Man's direction vector.
  - **Wraith / Inky (The Flanker)**: Coordinates complex flanking maneuvers using Blinky's relative offset.
  - **Hex / Clyde (The Wildcard)**: Chases at a distance, then retreats to scatter territory when within 8 tiles.
  - Authentic **Scatter / Chase** cycling and combo point multipliers.
- **🔊 Procedural Web Audio Engine**:
  - 100% zero external audio files. All sounds (waka-waka, proximity sirens, heartbeat pulses, arpeggiated power chords, and death noise bursts) are synthesized in real-time via the Web Audio API.

---

## 🕹️ Controls

| Input | Action |
|---|---|
| **👆 Point Finger / Wave** | Steer Pac-Man (Up / Down / Left / Right) |
| **✊ Clench Fist** | Emergency Brake / Pause |
| **🤏 Pinch (Thumb + Index)** | Toggle Tactical First-Person POV |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or Arrows | Classic Keyboard Steering |
| <kbd>G</kbd> | Toggle Iron Man Gesture Core on/off |
| <kbd>V</kbd> | Switch between 3D Arena and 2D Vector grid |
| <kbd>P</kbd> | Force First-Person POV |
| <kbd>Space</kbd> | Pause / Resume Run |
| <kbd>M</kbd> | Mute / Unmute Audio Synthesizer |
| <kbd>R</kbd> | Restart Game |
| <kbd>?</kbd> / <kbd>H</kbd> | Open Field Manual Dossier |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ (tested on Node v24)
- **npm** or **bun** / **pnpm**
- A standard webcam (for gesture controls)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/neon-chomp-3d-pacman.git
cd neon-chomp-3d-pacman

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build

```bash
# Build standalone single-file bundle
npm run build
```

This generates a self-contained, inlined bundle in `dist/index.html` via `vite-plugin-singlefile`.

---

## 🏗️ Architecture

```
immersive-3d-pacman-game/
├── public/
│   ├── models/            # Offline MediaPipe hand landmarker task model
│   └── wasm/              # Offline MediaPipe Vision WebAssembly runtime
├── src/
│   ├── components/
│   │   ├── HologramHud.tsx # Iron Man PiP HUD & webcam canvas overlay
│   │   └── ui.tsx          # Cyberpunk SVG icon library & glass UI widgets
│   ├── game/
│   │   ├── audio.ts        # Pure Web Audio API procedural synthesizer
│   │   ├── engine.ts       # Core Pac-Man state machine & Ghost AI logic
│   │   ├── handTracking.ts # MediaPipe hand tracking & gesture classifier
│   │   ├── maze.ts         # Tile matrix, grid coordinates, and pathfinding
│   │   ├── render2d.ts     # Canvas 2D vector neon renderer
│   │   └── scene3d.ts      # Three.js 3D orbit and POV scene graph
│   ├── App.tsx             # Main React application & telemetry state
│   ├── main.tsx            # React root mount
│   └── index.css           # Tailwind v4 cyberpunk theme tokens & scanline shaders
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛡️ License

MIT License. Crafted for the night shift.
