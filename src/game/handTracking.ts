import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export type HandDirection = "up" | "down" | "left" | "right";

export interface GestureTelemetry {
  active: boolean;
  handPresent: boolean;
  direction: HandDirection | null;
  gestureName: string;
  isFist: boolean;
  isPinch: boolean;
  confidence: number;
  fps: number;
  landmarks: NormalizedLandmark[] | null;
}

export type GestureDirectionCallback = (dir: HandDirection) => void;
export type GestureActionCallback = (action: "pause" | "pov" | "restart") => void;

const FINGER_BONES = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17],
];

export class HandTrackingService {
  private static instance: HandTrackingService | null = null;
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private animId: number = 0;
  private isRunning = false;
  private lastVideoTime = -1;
  private lastFrameTime = performance.now();
  private frameCount = 0;
  private currentFps = 30;

  // Gesture state & debounce
  private lastDirection: HandDirection | null = null;
  private lastFistState = false;
  private lastPinchState = false;
  private fistCooldown = 0;
  private pinchCooldown = 0;
  private dirConfidenceCounter = 0;
  private candidateDir: HandDirection | null = null;

  // Callbacks
  private onDirectionCb: GestureDirectionCallback | null = null;
  private onActionCb: GestureActionCallback | null = null;
  private onTelemetryCb: ((telemetry: GestureTelemetry) => void) | null = null;

  static getInstance(): HandTrackingService {
    if (!HandTrackingService.instance) {
      HandTrackingService.instance = new HandTrackingService();
    }
    return HandTrackingService.instance;
  }

  isTracking(): boolean {
    return this.isRunning;
  }

  setTelemetryCallback(cb: ((telemetry: GestureTelemetry) => void) | null) {
    this.onTelemetryCb = cb;
  }

  setCanvas(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
  }

  async init(
    onDirection: GestureDirectionCallback,
    onAction: GestureActionCallback,
    canvas?: HTMLCanvasElement | null
  ): Promise<boolean> {
    this.onDirectionCb = onDirection;
    this.onActionCb = onAction;
    if (canvas) this.canvas = canvas;

    if (this.isRunning) return true;

    try {
      if (!this.landmarker) {
        // Resolve wasm from local assets first, with CDN fallback
        let vision;
        try {
          vision = await FilesetResolver.forVisionTasks("/wasm");
        } catch {
          vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
          );
        }

        // Try local model task asset, fallback to CDN
        try {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/models/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
        } catch {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
        }
      }

      // Request webcam stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      this.video = document.createElement("video");
      this.video.srcObject = this.stream;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;

      await new Promise<void>((resolve) => {
        if (!this.video) return resolve();
        this.video.onloadedmetadata = () => {
          this.video?.play().then(() => resolve()).catch(() => resolve());
        };
      });

      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this.loop();
      return true;
    } catch (err) {
      console.error("[HandTracking] Initialization error:", err);
      this.stop();
      return false;
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    if (this.canvas) {
      const ctx = this.canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.onTelemetryCb?.({
      active: false,
      handPresent: false,
      direction: null,
      gestureName: "OFFLINE",
      isFist: false,
      isPinch: false,
      confidence: 0,
      fps: 0,
      landmarks: null,
    });
  }

  private loop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFrameTime));
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    if (this.video && this.landmarker && this.video.readyState >= 2) {
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const result = this.landmarker.detectForVideo(this.video, now);
        this.processDetection(result.landmarks?.[0] || null);
      }
    }

    this.animId = requestAnimationFrame(this.loop);
  };

  private processDetection(landmarks: NormalizedLandmark[] | null) {
    if (!landmarks || landmarks.length < 21) {
      this.renderCanvas(null, null, "SEARCHING FOR HAND...", false, false);
      this.onTelemetryCb?.({
        active: true,
        handPresent: false,
        direction: null,
        gestureName: "SCANNING",
        isFist: false,
        isPinch: false,
        confidence: 0,
        fps: this.currentFps,
        landmarks: null,
      });
      return;
    }

    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const middleMcp = landmarks[9];
    const middleTip = landmarks[12];
    const ringMcp = landmarks[13];
    const ringTip = landmarks[16];
    const pinkyMcp = landmarks[17];
    const pinkyTip = landmarks[20];

    // Helper: 2D Euclidean distance
    const dist2D = (p1: NormalizedLandmark, p2: NormalizedLandmark) =>
      Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // 1. Fist Detection (Inspired by Iron-Man-Hologram hand_tracking.py)
    // Compare tip-to-mcp distance vs mcp-to-wrist distance
    const fingers = [
      { tip: indexTip, mcp: indexMcp },
      { tip: middleTip, mcp: middleMcp },
      { tip: ringTip, mcp: ringMcp },
      { tip: pinkyTip, mcp: pinkyMcp },
    ];
    let totalExtensionRatio = 0;
    for (const f of fingers) {
      const tipToMcp = dist2D(f.tip, f.mcp);
      const mcpToWrist = dist2D(f.mcp, wrist);
      totalExtensionRatio += tipToMcp / Math.max(0.01, mcpToWrist);
    }
    const avgExtension = totalExtensionRatio / 4;
    const isFist = avgExtension < 0.65;

    // 2. Pinch Detection (Thumb tip close to Index tip)
    const pinchDist = dist2D(thumbTip, indexTip);
    const isPinch = !isFist && pinchDist < 0.06;

    // 3. Directional Steering
    // The webcam video is mirrored on screen:
    // When user points right in their physical room, in mirrored coordinates dx > 0.
    // In camera coordinates, x increases to the right. So screen_dx = -(tip.x - mcp.x)
    const rawDx = indexTip.x - indexPip.x;
    const rawDy = indexTip.y - indexPip.y;
    // Mirrored screen direction vector
    const screenDx = -rawDx;
    const screenDy = rawDy;

    // Palm center in mirrored coordinates
    const palmX = 1 - (wrist.x + middleMcp.x) / 2;
    const palmY = (wrist.y + middleMcp.y) / 2;

    let detectedDir: HandDirection | null = null;
    let gestureLabel = "OPEN PALM";

    // Action cooldowns
    if (this.fistCooldown > 0) this.fistCooldown--;
    if (this.pinchCooldown > 0) this.pinchCooldown--;

    if (isFist) {
      gestureLabel = "CLOSED FIST (BRAKE)";
      if (!this.lastFistState && this.fistCooldown === 0) {
        this.fistCooldown = 18;
        this.onActionCb?.("pause");
      }
    } else if (isPinch) {
      gestureLabel = "PINCH (TACTICAL POV)";
      if (!this.lastPinchState && this.pinchCooldown === 0) {
        this.pinchCooldown = 22;
        this.onActionCb?.("pov");
      }
    } else {
      // Calculate pointing angle from index PIP to Index Tip
      const magnitude = Math.hypot(screenDx, screenDy);
      const isIndexExtended = dist2D(indexTip, indexMcp) > dist2D(middleTip, middleMcp) * 1.15;

      // Virtual Joystick / Pointing vector calculation
      const angle = Math.atan2(screenDy, screenDx); // radians: 0 = right, pi/2 = down, -pi/2 = up, pi = left
      const deg = (angle * 180) / Math.PI;

      if (magnitude > 0.04 || isIndexExtended) {
        if (deg >= -45 && deg <= 45) {
          detectedDir = "right";
          gestureLabel = "STEER RIGHT";
        } else if (deg > 45 && deg < 135) {
          detectedDir = "down";
          gestureLabel = "STEER DOWN";
        } else if (deg >= 135 || deg <= -135) {
          detectedDir = "left";
          gestureLabel = "STEER LEFT";
        } else if (deg >= -135 && deg < -45) {
          detectedDir = "up";
          gestureLabel = "STEER UP";
        }
      }

      // Secondary check: Position-based steering (if hand is pushed to grid margins)
      if (!detectedDir) {
        if (palmX > 0.68) {
          detectedDir = "right";
          gestureLabel = "SECTOR RIGHT";
        } else if (palmX < 0.32) {
          detectedDir = "left";
          gestureLabel = "SECTOR LEFT";
        } else if (palmY < 0.3) {
          detectedDir = "up";
          gestureLabel = "SECTOR UP";
        } else if (palmY > 0.72) {
          detectedDir = "down";
          gestureLabel = "SECTOR DOWN";
        }
      }
    }

    this.lastFistState = isFist;
    this.lastPinchState = isPinch;

    // Direction debouncing (require 2 consecutive matching frames to prevent turn jitter)
    if (detectedDir) {
      if (detectedDir === this.candidateDir) {
        this.dirConfidenceCounter++;
        if (this.dirConfidenceCounter >= 2) {
          if (detectedDir !== this.lastDirection) {
            this.lastDirection = detectedDir;
            this.onDirectionCb?.(detectedDir);
          }
        }
      } else {
        this.candidateDir = detectedDir;
        this.dirConfidenceCounter = 1;
      }
    } else {
      this.candidateDir = null;
      this.dirConfidenceCounter = 0;
    }

    // Render Iron Man Holographic HUD
    this.renderCanvas(landmarks, this.lastDirection, gestureLabel, isFist, isPinch);

    this.onTelemetryCb?.({
      active: true,
      handPresent: true,
      direction: this.lastDirection,
      gestureName: gestureLabel,
      isFist,
      isPinch,
      confidence: Math.round((1 - Math.min(1, avgExtension)) * 100),
      fps: this.currentFps,
      landmarks,
    });
  }

  // Draw the Iron Man Holographic Skeleton & HUD
  private renderCanvas(
    landmarks: NormalizedLandmark[] | null,
    activeDir: HandDirection | null,
    statusText: string,
    isFist: boolean,
    isPinch: boolean
  ) {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Draw webcam feed mirrored with cyber-hologram filter
    if (this.video && this.video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.42;
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
    }

    // Dark cyan-violet holographic wash
    ctx.fillStyle = "rgba(6, 4, 18, 0.68)";
    ctx.fillRect(0, 0, w, h);

    // 2. Holographic Scanlines
    ctx.fillStyle = "rgba(0, 212, 255, 0.035)";
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }

    // 3. Futuristic Corner Targeting Brackets
    const bracketSize = 18;
    ctx.strokeStyle = "rgba(0, 212, 255, 0.55)";
    ctx.lineWidth = 1.8;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(8, 8 + bracketSize);
    ctx.lineTo(8, 8);
    ctx.lineTo(8 + bracketSize, 8);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - 8 - bracketSize, 8);
    ctx.lineTo(w - 8, 8);
    ctx.lineTo(w - 8, 8 + bracketSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(8, h - 8 - bracketSize);
    ctx.lineTo(8, h - 8);
    ctx.lineTo(8 + bracketSize, h - 8);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - 8 - bracketSize, h - 8);
    ctx.lineTo(w - 8, h - 8);
    ctx.lineTo(w - 8, h - 8 - bracketSize);
    ctx.stroke();

    // 4. Render Hand Skeleton if detected
    if (landmarks && landmarks.length >= 21) {
      // Map normalized mirrored coords to canvas pixels
      const toPx = (lm: NormalizedLandmark) => ({
        x: (1 - lm.x) * w,
        y: lm.y * h,
      });

      const pts = landmarks.map(toPx);

      // Choose glow color: Gold for fist, Pink for pinch, Cyan for standard
      const themeColor = isFist ? "#ffd83d" : isPinch ? "#ff5fa2" : "#00d4ff";
      const jointColor = isFist ? "#ffffff" : isPinch ? "#ffd83d" : "#56e8ff";

      // Draw bones with glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = themeColor;
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const [i, j] of FINGER_BONES) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }

      // Draw joint nodes
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
        const radius = isTip ? 4.5 : i === 0 ? 5.5 : 3.2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? "#ffffff" : jointColor;
        ctx.fill();
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Draw Palm Arc Reactor Reticle
      const palmCenter = {
        x: (pts[0].x + pts[9].x) / 2,
        y: (pts[0].y + pts[9].y) / 2,
      };

      ctx.beginPath();
      ctx.arc(palmCenter.x, palmCenter.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(palmCenter.x, palmCenter.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Index pointing laser line if extended
      if (activeDir && !isFist && !isPinch) {
        ctx.beginPath();
        ctx.moveTo(pts[8].x, pts[8].y);
        const dirVectors: Record<HandDirection, { dx: number; dy: number }> = {
          up: { dx: 0, dy: -28 },
          down: { dx: 0, dy: 28 },
          left: { dx: -28, dy: 0 },
          right: { dx: 28, dy: 0 },
        };
        const vec = dirVectors[activeDir];
        ctx.lineTo(pts[8].x + vec.dx, pts[8].y + vec.dy);
        ctx.strokeStyle = "#ffd83d";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#ffd83d";
        ctx.shadowBlur = 14;
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;

    // 5. Directional Chevrons in the center HUD
    const cx = w / 2;
    const cy = h / 2;
    const arrowDist = 32;

    const drawChevron = (
      dir: HandDirection,
      px: number,
      py: number,
      angle: number
    ) => {
      const active = activeDir === dir;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-7, -4);
      ctx.lineTo(0, 4);
      ctx.lineTo(7, -4);
      ctx.strokeStyle = active ? "#ffd83d" : "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = active ? 2.8 : 1.4;
      if (active) {
        ctx.shadowColor = "#ffd83d";
        ctx.shadowBlur = 12;
      }
      ctx.stroke();
      ctx.restore();
    };

    drawChevron("up", cx, cy - arrowDist, Math.PI);
    drawChevron("down", cx, cy + arrowDist, 0);
    drawChevron("left", cx - arrowDist, cy, Math.PI / 2);
    drawChevron("right", cx + arrowDist, cy, -Math.PI / 2);

    // 6. Top Telemetry Header
    ctx.font = "bold 9px 'Chakra Petch', monospace";
    ctx.fillStyle = "rgba(0, 212, 255, 0.85)";
    ctx.fillText("JARVIS // MK-VII GESTURE CORE", 12, 20);

    ctx.font = "8px 'Chakra Petch', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillText(`${this.currentFps} FPS · 60Hz SENSORS`, w - 100, 20);

    // 7. Bottom Status Pill
    ctx.fillStyle = isFist
      ? "rgba(255, 216, 61, 0.2)"
      : isPinch
      ? "rgba(255, 95, 162, 0.2)"
      : activeDir
      ? "rgba(0, 212, 255, 0.2)"
      : "rgba(255, 255, 255, 0.08)";
    ctx.strokeStyle = isFist
      ? "#ffd83d"
      : isPinch
      ? "#ff5fa2"
      : activeDir
      ? "#00d4ff"
      : "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;

    const pillY = h - 24;
    const pillH = 16;
    ctx.beginPath();
    ctx.roundRect(10, pillY, w - 20, pillH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 8.5px 'Chakra Petch', monospace";
    ctx.fillStyle = isFist ? "#ffd83d" : isPinch ? "#ff5fa2" : "#ffffff";
    ctx.fillText(statusText, 16, pillY + 11);

    ctx.restore();
  }
}

export const handTracker = HandTrackingService.getInstance();
