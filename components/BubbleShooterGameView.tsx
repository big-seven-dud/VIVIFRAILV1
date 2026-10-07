import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserSettings } from '../types';
import { getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  config: { level: 'A' | 'B' | 'C' | 'D', time: number, targetCount: number };
  onComplete: (score: number, details?: any) => void;
  onCancel: () => void;
  speak: (t: string) => void;
}

// MediaPipe Hands global typings definition
declare const Hands: any;

interface GridBubble {
  id: string;
  color: string;
  row: number;
  col: number;
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
}

interface FallingBubble {
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const COLOR_NAMES: Record<string, string> = {
  '#ef4444': '紅色',
  '#3b82f6': '藍色',
  '#10b981': '綠色',
  '#f59e0b': '黃色',
  '#8b5cf6': '紫色',
  '#ec4899': '粉色'
};

const BubbleShooterGameView: React.FC<Props> = ({ settings, config, onComplete, onCancel, speak }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.time);
  const [combo, setCombo] = useState(0);
  const [shotsCount, setShotsCount] = useState(0);
  const [bubbleClearedCount, setBubbleClearedCount] = useState(0);
  const [showResult, setShowResult] = useState(false);

  type GestureState = 'OPEN' | 'PINCHING' | 'ARMED';

// Hand state
  const [handPinching, setHandPinching] = useState(false);
  const [pinchProgress, setPinchProgress] = useState(0);
  const [pullPower, setPullPower] = useState(0);
  const [gestureState, setGestureState] = useState<GestureState>('OPEN');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameActive = useRef(true);
  const loopRef = useRef<number | null>(null);
  
  // Game Play Engine references
  const gridRows = 9;
  const numColsEven = 8;
  const numColsOdd = 7;
  const bubbleRadius = 18;
  const colWidth = bubbleRadius * 2;
  const rowHeight = Math.floor(bubbleRadius * Math.sqrt(3));
  
  const grid = useRef<(GridBubble | null)[][]>(Array.from({ length: gridRows }, () => []));
  const activeBullet = useRef<{ x: number; y: number; vx: number; vy: number; color: string } | null>(null);
  const nextBulletColor = useRef<string>(COLORS[0]);
  const launcherPos = useRef({ x: 300, y: 680 }); // Centered launcher base coordinates

  // 靈活瞄準與射擊狀態 (支援手指直覺瞄準、懸停蓄力、雙指捏合、滑鼠/觸控點擊)
  const currentAimAngle = useRef(-Math.PI / 2);
  const lockedAimAngle = useRef(-Math.PI / 2);
  const lastFireTime = useRef(0);
  const handDetected = useRef(false);
  
  // Hand tracking
  const pointerPos = useRef({ x: 0.5, y: 0.5, z: 0 });
  const isPinching = useRef(false);
  
  const pinchStart = useRef<{ x: number; y: number } | null>(null);
  
  const gestureStateRef = useRef<GestureState>('OPEN');
  const pullPowerRef = useRef(0);

  // Particle effects & falling avalanche elements
  const particles = useRef<Particle[]>([]);
  const fallingBubbles = useRef<FallingBubble[]>([]);

  // Sound throttles
  const lastSoundTime = useRef(0);
  const playSoundEffect = (type: 'pop' | 'shoot' | 'drag' | 'win' | 'avalanche') => {
    const now = Date.now();
    if (now - lastSoundTime.current < 120) return;
    lastSoundTime.current = now;

    if (type === 'pop') speak("啵！");
    if (type === 'shoot') speak("蹦！");
    if (type === 'avalanche') speak("嘩啦！");
  };

  // State sync and update helper for rendering state changes inside game ticks
  const stateRef = useRef({
    score: 0,
    combo: 0,
    shotsCount: 0,
    bubbleClearedCount: 0,
    gameActive: true
  });

  const getHexNeighbors = (r: number, c: number) => {
    const isEven = (r % 2 === 0);
    const cols = isEven ? numColsEven : numColsOdd;
    const neighbors: { r: number; c: number }[] = [];

    // Left & Right
    if (c > 0) neighbors.push({ r, c: c - 1 });
    if (c < cols - 1) neighbors.push({ r, c: c + 1 });

    // Rows above & below list depending on staggered alignments
    if (isEven) {
      // Even row neighbors: c-1, c in odd row
      neighbors.push({ r: r - 1, c: c - 1 });
      neighbors.push({ r: r - 1, c });
      neighbors.push({ r: r + 1, c: c - 1 });
      neighbors.push({ r: r + 1, c });
    } else {
      // Odd row neighbors: c, c+1 in even row
      neighbors.push({ r: r - 1, c });
      neighbors.push({ r: r - 1, c: c + 1 });
      neighbors.push({ r: r + 1, c });
      neighbors.push({ r: r + 1, c: c + 1 });
    }

    return neighbors.filter(n => n.r >= 0 && n.r < gridRows);
  };

  // 1. Setup Initial Grid
  const setupInitialGrid = useCallback(() => {
    const activeColors = COLORS.slice(0, config.level === 'A' ? 3 : config.level === 'B' ? 4 : config.level === 'C' ? 5 : 6);
    grid.current = Array.from({ length: gridRows }, () => []);

    for (let r = 0; r < 4; r++) {
      const isEven = (r % 2 === 0);
      const cols = isEven ? numColsEven : numColsOdd;
      const xOffset = isEven ? bubbleRadius : bubbleRadius + Math.floor(bubbleRadius / 2);

      for (let c = 0; c < cols; c++) {
        const randomColor = activeColors[Math.floor(Math.random() * activeColors.length)];
        const gridBubble: GridBubble = {
          id: `${r}-${c}-${Math.random()}`,
          color: randomColor,
          row: r,
          col: c,
          x: xOffset + c * (bubbleRadius * 2),
          y: bubbleRadius * 1.5 + r * rowHeight
        };
        grid.current[r][c] = gridBubble;
      }
    }

    // Initialize Ammo
    activeBullet.current = null;
    nextBulletColor.current = activeColors[Math.floor(Math.random() * activeColors.length)];
  }, [config.level]);

  // Load local state references properly 
  useEffect(() => {
    setupInitialGrid();
  }, [setupInitialGrid]);

  // Handle countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (gameActive.current && !showResult) {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            onGameOver();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [showResult]);

  const onGameOver = () => {
    gameActive.current = false;
    stateRef.current.gameActive = false;
    setShowResult(true);
    speak("訓練時間結束！做得好！讓我們來看看您的驚人拼搏成果吧。");
  };

  // Fire a single bullet in aimed direction
  const fireBullet = (overrideAngle?: number) => {
    if (!gameActive.current) return;
    if (activeBullet.current) return; // Wait until current bullet snaps
    
    const now = Date.now();
    if (now - lastFireTime.current < 280) return; // 短暫冷卻防抖
    lastFireTime.current = now;

    let angle = typeof overrideAngle === 'number' ? overrideAngle : currentAimAngle.current;
    
    // 確保子彈往上方扇形區域射擊 (避免往地板射)
    if (angle > 0) {
      angle = -Math.PI / 2;
    } else {
      angle = Math.max(-Math.PI + 0.18, Math.min(-0.18, angle));
    }

    // 俐落飛行速度
    const speed = 22;

    activeBullet.current = {
      x: launcherPos.current.x,
      y: launcherPos.current.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: nextBulletColor.current
    };

   

    // Cycle next weapon color
    const activeColors = COLORS.slice(0, config.level === 'A' ? 3 : config.level === 'B' ? 4 : config.level === 'C' ? 5 : 6);
    nextBulletColor.current = activeColors[Math.floor(Math.random() * activeColors.length)];

    stateRef.current.shotsCount += 1;
    setShotsCount(stateRef.current.shotsCount);

    playSoundEffect('shoot');
  };

  // Grid floodfill cluster checking
  const checkClusterAndPop = (snapRow: number, snapCol: number, colorToMatch: string) => {
    const queue: { r: number; c: number }[] = [{ r: snapRow, c: snapCol }];
    const visited = new Set<string>();
    visited.add(`${snapRow},${snapCol}`);

    const cluster: GridBubble[] = [];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const bubble = grid.current[current.r]?.[current.c];
      
      if (bubble && bubble.color === colorToMatch) {
        cluster.push(bubble);
        
        // Find adjacent neighbors
        const neighbors = getHexNeighbors(current.r, current.c);
        for (const n of neighbors) {
          const key = `${n.r},${n.c}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push(n);
          }
        }
      }
    }

    if (cluster.length >= 3) {
      // Win pop action!
      playSoundEffect('pop');
      stateRef.current.combo++;
      setCombo(stateRef.current.combo);

      const popPoints = cluster.length * 10 * stateRef.current.combo;
      stateRef.current.score += popPoints;
      stateRef.current.bubbleClearedCount += cluster.length;
      setScore(stateRef.current.score);
      setBubbleClearedCount(stateRef.current.bubbleClearedCount);

      // Trigger exploding particles
      cluster.forEach(b => {
        // Explode grid slot
        grid.current[b.row][b.col] = null;
        for (let idx = 0; idx < 12; idx++) {
          particles.current.push({
            x: b.x,
            y: b.y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            color: b.color,
            size: 4 + Math.random() * 4,
            alpha: 1.0
          });
        }
      });

      // After a cluster is removed, trigger AVALANCHE drop calculation
      triggerAvalancheCheck();
    } else {
      // Normal snap, reset combo
      stateRef.current.combo = 0;
      setCombo(0);
    }
  };

  // Avalanche gravity floating checker (Breadth first search starting from row 0)
  const triggerAvalancheCheck = () => {
    const connected = new Set<string>();
    const queue: { r: number; c: number }[] = [];

    // Find all base attachments in Row 0
    const startRow = grid.current[0];
    if (startRow) {
      for (let c = 0; c < startRow.length; c++) {
        if (startRow[c]) {
          connected.add(`0,${c}`);
          queue.push({ r: 0, c });
        }
      }
    }

    // Traverse connected path from top Ceiling
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = getHexNeighbors(current.r, current.c);
      for (const n of neighbors) {
        const key = `${n.r},${n.c}`;
        const bubbleObj = grid.current[n.r]?.[n.c];
        if (bubbleObj && !connected.has(key)) {
          connected.add(key);
          queue.push(n);
        }
      }
    }

    // Any non-empty bubble in active grid not found in "connected" set belongs to the floating avalanche!
    let droppedCount = 0;
    for (let r = 0; r < gridRows; r++) {
      const isEven = (r % 2 === 0);
      const cols = isEven ? numColsEven : numColsOdd;
      for (let c = 0; c < cols; c++) {
        const bubble = grid.current[r]?.[c];
        if (bubble && !connected.has(`${r},${c}`)) {
          droppedCount++;
          // Spawns with nice arcade physics
          fallingBubbles.current.push({
            color: bubble.color,
            x: bubble.x,
            y: bubble.y,
            vx: (Math.random() - 0.5) * 4,
            vy: -2 + Math.random() * -3, // subtle pop boost before descent 
            angle: Math.random() * Math.PI,
            vAngle: (Math.random() - 0.5) * 0.1
          });
          grid.current[r][c] = null; // empty this node
        }
      }
    }

    if (droppedCount > 0) {
      playSoundEffect('avalanche');
      const avalancheBonus = droppedCount * 20 * stateRef.current.combo;
      stateRef.current.score += avalancheBonus;
      setScore(stateRef.current.score);
    }
  };

  // Grid item attachment algorithm
  const snapAndBindToGrid = (bullet: { x: number; y: number; color: string }) => {
    let bestDist = Infinity;
    let targetRow = -1;
    let targetCol = -1;
    let snapX = bullet.x;
    let snapY = bullet.y;

    // Scan slots
    for (let r = 0; r < gridRows; r++) {
      const isEven = (r % 2 === 0);
      const cols = isEven ? numColsEven : numColsOdd;
      const xOffset = isEven ? bubbleRadius : bubbleRadius + Math.floor(bubbleRadius / 2);

      for (let c = 0; c < cols; c++) {
        // Skip if already occupied
        if (grid.current[r]?.[c]) continue;

        const slotX = xOffset + c * (bubbleRadius * 2);
        const slotY = bubbleRadius * 1.5 + r * rowHeight;

        const dist = Math.hypot(bullet.x - slotX, bullet.y - slotY);
        if (dist < bestDist) {
          bestDist = dist;
          targetRow = r;
          targetCol = c;
          snapX = slotX;
          snapY = slotY;
        }
      }
    }

    if (targetRow !== -1 && targetCol !== -1) {
      const newGridBubble: GridBubble = {
        id: `${targetRow}-${targetCol}-${Math.random()}`,
        color: bullet.color,
        row: targetRow,
        col: targetCol,
        x: snapX,
        y: snapY
      };
      // Bind to index
      grid.current[targetRow][targetCol] = newGridBubble;
      
      // Check cluster color eliminator
      checkClusterAndPop(targetRow, targetCol, bullet.color);
    }
  };

  // Core drawing and physics updates
  const gameStep = () => {
    if (!canvasRef.current || !gameActive.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A. Clean canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get current launcher center
    launcherPos.current = { x: canvas.width / 2, y: canvas.height - 50 };

    // B. Draw ceiling layout boundary (for immersive design)
    ctx.fillStyle = '#1e1b4b'; // dark frame accent
    ctx.fillRect(0, 0, canvas.width, 10);

    // C. Draw active grid list with glowing spheres
    for (let r = 0; r < gridRows; r++) {
      const isEven = (r % 2 === 0);
      const cols = isEven ? numColsEven : numColsOdd;
      for (let c = 0; c < cols; c++) {
        const b = grid.current[r]?.[c];
        if (b) {
          ctx.save();
          // Sphere radial glow style
          const gradient = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bubbleRadius);
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(0.3, b.color);
          gradient.addColorStop(1, '#0e0b16');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(b.x, b.y, bubbleRadius, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = '#ffffffaa';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // D. Move and Update Fired Bullet physics
    if (activeBullet.current) {
      const b = activeBullet.current;
      b.x += b.vx;
      b.y += b.vy;

      // Bounce left right walls
      if (b.x - bubbleRadius < 0) {
        b.x = bubbleRadius;
        b.vx = -b.vx;
      } else if (b.x + bubbleRadius > canvas.width) {
        b.x = canvas.width - bubbleRadius;
        b.vx = -b.vx;
      }

      // Check collision against grid bubbles
      let collided = false;
      for (let r = 0; r < gridRows; r++) {
        const isEven = (r % 2 === 0);
        const cols = isEven ? numColsEven : numColsOdd;
        for (let c = 0; c < cols; c++) {
          const gBubble = grid.current[r]?.[c];
          if (gBubble) {
            const dist = Math.hypot(b.x - gBubble.x, b.y - gBubble.y);
            if (dist < bubbleRadius * 1.85) {
              collided = true;
              break;
            }
          }
        }
        if (collided) break;
      }

      // Collide ceiling
      if (b.y - bubbleRadius <= 10) {
        collided = true;
      }

      if (collided) {
        // Snap bullet into closest vacant hex node
        snapAndBindToGrid(b);
        activeBullet.current = null; // deactivate
      } else {
        // Draw flying Bullet 
        ctx.save();
        const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bubbleRadius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, b.color);
        grad.addColorStop(1, '#090514');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
      }
    }

    // E. 繪製高科技動態折射瞄準導引線 (Aiming Laser Guide with Wall Reflection)
    const targetAngle = currentAimAngle.current;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = '#38bdf8cc';
    ctx.lineWidth = 3.5;

    let rayX = launcherPos.current.x;
    let rayY = launcherPos.current.y;
    let rayVx = Math.cos(targetAngle) * 12;
    let rayVy = Math.sin(targetAngle) * 12;

    ctx.moveTo(rayX, rayY);
    for (let i = 0; i < 55; i++) {
      rayX += rayVx;
      rayY += rayVy;

      // 邊界反彈預覽
      if (rayX < bubbleRadius || rayX > canvas.width - bubbleRadius) {
        rayVx = -rayVx;
      }
      ctx.lineTo(rayX, rayY);

      // 到達頂部或觸及現有泡泡停止
      if (rayY < 35) break;

      let hitGrid = false;
      for (let r = 0; r < gridRows; r++) {
        const isEven = (r % 2 === 0);
        const cols = isEven ? numColsEven : numColsOdd;
        for (let c = 0; c < cols; c++) {
          const gb = grid.current[r]?.[c];
          if (gb && Math.hypot(rayX - gb.x, rayY - gb.y) < bubbleRadius * 1.85) {
            hitGrid = true;
            break;
          }
        }
        if (hitGrid) break;
      }
      if (hitGrid) break;
    }
    ctx.stroke();

    // 瞄準落點光標
    ctx.beginPath();
    ctx.arc(rayX, rayY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // F. 繪製高科技旋轉發射砲台 (Rotating Cannon Turret)
    ctx.save();
    ctx.translate(launcherPos.current.x, launcherPos.current.y);
    ctx.rotate(targetAngle + Math.PI / 2); // 旋轉砲管面向瞄準方向

    // 砲管主體
    ctx.fillStyle = '#4f46e5';
    ctx.strokeStyle = '#c7d2fe';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(-14, -55, 28, 48);
    ctx.fill();
    ctx.stroke();

    // 砲台圓盤基座
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fillStyle = '#312e81';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#818cf8';
    ctx.stroke();

    ctx.restore();

    // 發射台填裝之彈藥泡泡
    const ammoColor = nextBulletColor.current;
    const ammoX = launcherPos.current.x + Math.cos(targetAngle) * 35;
    const ammoY = launcherPos.current.y + Math.sin(targetAngle) * 35;
    
    const ammoGrad = ctx.createRadialGradient(ammoX, ammoY, 2, ammoX, ammoY, bubbleRadius);
    ammoGrad.addColorStop(0, '#ffffff');
    ammoGrad.addColorStop(0.3, ammoColor);
    ammoGrad.addColorStop(1, '#0e0b16');
    ctx.fillStyle = ammoGrad;
    ctx.beginPath();
    ctx.arc(ammoX, ammoY, bubbleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // G. Draw Particles & Popping mechanics
    particles.current = particles.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // slight gravity
      p.alpha -= 0.025; // fade

      if (p.alpha <= 0) return false;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return true;
    });

    // H. Falling avalanche bubbles (physics gravity simulation)
    fallingBubbles.current = fallingBubbles.current.filter(f => {
      f.x += f.vx;
      f.y += f.vy;
      f.vy += 0.35; // direct physics gravity acceleration
      f.angle += f.vAngle;

      // Keep inside bounds but let it fall off bottom
      if (f.y - bubbleRadius > canvas.height) {
        return false; // delete
      }

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      
      const fGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, bubbleRadius);
      fGrad.addColorStop(0, '#ffffff');
      fGrad.addColorStop(0.4, f.color);
      fGrad.addColorStop(1, '#000000');
      ctx.fillStyle = fGrad;
      
      ctx.beginPath();
      ctx.arc(0, 0, bubbleRadius, 0, Math.PI * 2);
      ctx.fill();

      // Fun physical spinning line to emphasize rotating avalanche drops
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-bubbleRadius + 4, 0);
      ctx.lineTo(bubbleRadius - 4, 0);
      ctx.stroke();

      ctx.restore();
      return true;
    });

    // I. Draw virtual Cyber UI hand pointer & Dwell auto-shoot progress
// I. Hand aiming / slingshot visual feedback
    if (handDetected.current && pointerPos.current) {
      const pX = pointerPos.current.x * canvas.width;
      const pY = pointerPos.current.y * canvas.height;
    
      const currentGesture = gestureStateRef.current;
      const power = pullPowerRef.current;
    
      ctx.save();
    
      // 手部游標
      ctx.beginPath();
      ctx.strokeStyle =
        currentGesture === 'ARMED'
          ? '#22c55e'
          : currentGesture === 'PINCHING'
            ? '#f59e0b'
            : '#38bdf8';
    
      ctx.lineWidth = 4;
      ctx.arc(pX, pY, 24, 0, Math.PI * 2);
      ctx.stroke();
    
      ctx.beginPath();
      ctx.fillStyle =
        currentGesture === 'ARMED'
          ? '#22c55e'
          : currentGesture === 'PINCHING'
            ? '#f59e0b'
            : '#38bdf8';
    
      ctx.arc(pX, pY, 6, 0, Math.PI * 2);
      ctx.fill();
    
      // 捏住之後畫出拉弓線
      if (
        pinchStart.current &&
        currentGesture !== 'OPEN'
      ) {
        const startX =
          pinchStart.current.x * canvas.width;
    
        const startY =
          pinchStart.current.y * canvas.height;
    
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pX, pY);
    
        ctx.strokeStyle =
          currentGesture === 'ARMED'
            ? '#22c55e'
            : '#f59e0b';
    
        ctx.lineWidth = 7;
        ctx.stroke();
    
        // 拉力條
        const barWidth = 140;
        const barHeight = 14;
    
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(
          pX - barWidth / 2,
          pY - 60,
          barWidth,
          barHeight
        );
    
        ctx.fillStyle =
          currentGesture === 'ARMED'
            ? '#22c55e'
            : '#f59e0b';
    
        ctx.fillRect(
          pX - barWidth / 2,
          pY - 60,
          barWidth * (power / 100),
          barHeight
        );
      }
    
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
    
      if (currentGesture === 'OPEN') {
        ctx.fillStyle = '#bae6fd';
        ctx.fillText(
          '左右移動瞄準',
          pX,
          pY - 38
        );
      }
    
      if (currentGesture === 'PINCHING') {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(
          `向下拉 ${power}%`,
          pX,
          pY - 78
        );
      }
    
      if (currentGesture === 'ARMED') {
        ctx.fillStyle = '#4ade80';
        ctx.fillText(
          `拉力 ${power}%・放開發射！`,
          pX,
          pY - 78
        );
      }
    
      ctx.restore();
    }

    loopRef.current = requestAnimationFrame(gameStep);
  };

  // Process MediaPipe Hands frame callback - 升級為直覺指向 + 捏合開火 + 懸停自動發射
  const onHandsResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current || !stateRef.current.gameActive) return;
  
    const canvas = canvasRef.current;
  
    const PINCH_CLOSE = 0.085;
    const PINCH_RELEASE = 0.11;
  
    // 捏住後向下拉至少畫面高度的 6%
    const MIN_PULL_DISTANCE = 0.06;
  
    // 拉到約 16% 視為滿蓄力
    const MAX_PULL_DISTANCE = 0.16;
  
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      handDetected.current = true;
  
      const landmarks = results.multiHandLandmarks[0];
  
      const thumb = landmarks[4];
      const index = landmarks[8];
  
      // 鏡像後食指座標
      const mirroredX = 1 - index.x;
      const indexY = index.y;
  
      pointerPos.current = {
        x: mirroredX,
        y: indexY,
        z: index.z
      };
  
      // --------------------------------------------------
      // 1. OPEN 狀態：只用左右位置控制瞄準
      // --------------------------------------------------
      if (!isPinching.current) {
        const horizontal = Math.max(
          -1,
          Math.min(1, (mirroredX - 0.5) * 2)
        );
  
        // -150° ~ -30°
        const targetAngle =
          -Math.PI / 2 +
          horizontal * (Math.PI / 3);
  
        // 平滑瞄準
        currentAimAngle.current +=
          (targetAngle - currentAimAngle.current) * 0.25;
      }
  
      // --------------------------------------------------
      // 2. Pinch distance
      // --------------------------------------------------
      const distance = Math.hypot(
        thumb.x - index.x,
        thumb.y - index.y
      );
  
      const closePct = Math.max(
        0,
        Math.min(
          100,
          Math.round((0.18 - distance) * 550)
        )
      );
  
      setPinchProgress(closePct);
  
      // 使用拇指與食指中點當作拉弓位置
      const pinchX =
        1 - ((thumb.x + index.x) / 2);
  
      const pinchY =
        (thumb.y + index.y) / 2;
  
      // --------------------------------------------------
      // 3. OPEN → PINCHING
      // --------------------------------------------------
      if (
        distance < PINCH_CLOSE &&
        !isPinching.current
      ) {
        isPinching.current = true;
        setHandPinching(true);
  
        pinchStart.current = {
          x: pinchX,
          y: pinchY
        };
  
        // 捏住當下鎖定方向
        lockedAimAngle.current =
          currentAimAngle.current;
  
        gestureStateRef.current = 'PINCHING';
        setGestureState('PINCHING');
  
        pullPowerRef.current = 0;
        setPullPower(0);
  
        return;
      }
  
      // --------------------------------------------------
      // 4. 保持捏住 → 計算向下拉距離
      // --------------------------------------------------
      if (
        isPinching.current &&
        distance <= PINCH_RELEASE &&
        pinchStart.current
      ) {
        const pullDistance = Math.max(
          0,
          pinchY - pinchStart.current.y
        );
  
        const power = Math.round(
          Math.min(
            1,
            pullDistance / MAX_PULL_DISTANCE
          ) * 100
        );
  
        pullPowerRef.current = power;
        setPullPower(power);
  
        if (pullDistance >= MIN_PULL_DISTANCE) {
          gestureStateRef.current = 'ARMED';
          setGestureState('ARMED');
        } else {
          gestureStateRef.current = 'PINCHING';
          setGestureState('PINCHING');
        }
  
        return;
      }
  
      // --------------------------------------------------
      // 5. 放開 → 只有 ARMED 才能射
      // --------------------------------------------------
      if (
        isPinching.current &&
        distance > PINCH_RELEASE
      ) {
        const shouldFire =
          gestureStateRef.current === 'ARMED';
  
        if (shouldFire) {
          fireBullet(lockedAimAngle.current);
        }
  
        // 無論有沒有射擊都重置
        isPinching.current = false;
        setHandPinching(false);
  
        pinchStart.current = null;
  
        gestureStateRef.current = 'OPEN';
        setGestureState('OPEN');
  
        pullPowerRef.current = 0;
        setPullPower(0);
  
        return;
      }
  
    } else {
      // 手離開鏡頭時不要誤射
      handDetected.current = false;
  
      isPinching.current = false;
      setHandPinching(false);
  
      pinchStart.current = null;
  
      gestureStateRef.current = 'OPEN';
      setGestureState('OPEN');
  
      pullPowerRef.current = 0;
      setPullPower(0);
  
      setPinchProgress(0);
    }
  };

  // Initialize camera and MediaPipe engine loop
  useEffect(() => {
    let camera: any = null;
    let cameraActiveFlag = true;

    const setupMediaPipe = async () => {
      const g = window as any;
      const HandsClass = g.Hands?.Hands || g.Hands;
      const CameraClass = getCameraClass();

      if (!HandsClass) {
        setCameraError("未在瀏覽器中檢測到 MediaPipe Hands 套件。請確認網路狀態良好並重試。");
        setIsInitializing(false);
        return;
      }

      if (!CameraClass) {
        setCameraError("找不到 MediaPipe CameraUtils 組件，請檢查加載環境。");
        setIsInitializing(false);
        return;
      }

      try {
        console.log("Setting up MediaPipe Hands engine...");
        const handsInstance = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        handsInstance.onResults(onHandsResults);

        if (videoRef.current && cameraActiveFlag) {
          camera = new CameraClass(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && stateRef.current.gameActive) {
                try {
                  await handsInstance.send({ image: videoRef.current });
                } catch (err) {
                  // Ignore frames send failures
                }
              }
            },
            width: 640,
            height: 480
          });

          await camera.start();
          console.log("MediaPipe Camera successfully started.");
          setIsInitializing(false);
          speak("泡泡射擊開始。左右移動食指瞄準，用拇指和食指捏住泡泡，向下拉，放開即可發射。");
        }
      } catch (err: any) {
        console.error("Camera startup error:", err);
        setCameraError(`鏡頭啟動失敗: ${err.message || String(err)}。請確認已授予系統相機鏡頭存取權限。`);
        setIsInitializing(false);
      }
    };

    // Delay start slightly to let DOM ready
    const timer = setTimeout(() => {
      setupMediaPipe();
    }, 500);

    // Initialize 2D rendering loop
    loopRef.current = requestAnimationFrame(gameStep);

    return () => {
      cameraActiveFlag = false;
      clearTimeout(timer);
      if (camera) {
        try {
          camera.stop();
        } catch (e) {
          // silent stop error
        }
      }
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
    };
  }, [config.level]);

  const handleEndSubmit = () => {
    onComplete(score, {
      shotsCount,
      bubbleClearedCount,
      level: config.level,
      gameDuration: config.time - timeLeft
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col md:flex-row overflow-hidden select-none">
      
      {/* LEFT PANEL: AR/Webcam with Cyber UI Overlay */}
      <div className="relative w-full md:w-1/3 bg-slate-900 border-b-4 md:border-b-0 md:border-r-4 border-slate-800 flex flex-col">
        {/* Title */}
        <div className="p-4 bg-slate-950/70 border-b border-indigo-500/20 text-center relative z-20">
          <h2 className="text-xl font-black text-indigo-400 tracking-wide">鏡頭姿態偵測區域</h2>
          <p className="text-xs text-slate-400">請拉開與鏡頭的距離 (1-1.5公尺) 以確保手勢偵測順利</p>
        </div>

        {/* Camera block */}
        <div className="flex-grow relative flex items-center justify-center bg-black overflow-hidden">
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover camera-mirror opacity-85" 
            autoPlay 
            muted 
            playsInline 
          />

          {/* Cyber scanner lines decoration */}
          <div className="absolute inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent top-1/4 animate-[pulse_2s_infinite] shadow-[0_0_15px_#6366f1] pointer-events-none z-10"></div>
          <div className="absolute inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent top-3/4 animate-[pulse_3s_infinite] shadow-[0_0_15px_#34d399] pointer-events-none z-10"></div>

          {/* Pinch Progress HUD */}
          <div className="absolute bottom-6 left-6 right-6 bg-slate-950/80 backdrop-blur-md p-4 rounded-3xl border-2 border-indigo-500/30 text-white shadow-2xl z-20 flex items-center gap-4">
            <div className="text-2xl">{handPinching ? '✊' : '✋'}</div>
            <div className="flex-grow space-y-1">
              <div className="flex justify-between text-xs font-bold font-mono">
                <span>單手捏合緊緻度 (Pinch Gauging)</span>
                <span className={handPinching ? 'text-red-400 animate-pulse' : 'text-indigo-300'}>{pinchProgress}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-indigo-500/10">
                <div 
                  className={`h-full transition-all duration-100 ${handPinching ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-indigo-500'}`} 
                  style={{ width: `${Math.min(100, pinchProgress)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Back and abort hooks */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex justify-center gap-4 z-20">
          <button 
            onClick={onCancel}
            className="px-6 py-3 bg-red-600/20 hover:bg-red-650/30 text-red-400 border border-red-500/30 rounded-2xl font-black text-sm transition active:scale-95 flex items-center gap-2"
          >
            ❌ 中途放棄
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: Interactive Game Stage */}
      <div className="flex-grow flex flex-col relative bg-[#090615] relative">
        {/* Game Stats HUD bar */}
        <div className="p-6 bg-slate-950/80 backdrop-blur-md border-b-2 border-slate-800 flex justify-between items-center z-10">
          <div>
            <span className="text-slate-400 font-bold text-xs uppercase tracking-widest font-mono">當前挑戰分數 (Arcade Score)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-indigo-400 drop-shadow-[0_0_15px_#6366f1]">{score}</span>
              <span className="text-base font-bold text-slate-500">分</span>
            </div>
          </div>

          <div className="flex gap-4">
            {combo > 0 && (
              <div className="bg-rose-500/20 border-2 border-rose-500/50 px-4 py-1.5 rounded-2xl flex items-center gap-2 animate-bounce">
                <span className="text-lg">🔥</span>
                <span className="font-extrabold text-sm text-rose-300">連擊倍率 X{combo}</span>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 px-5 py-2 rounded-2xl text-center min-w-[120px]">
              <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">剩餘秒數</span>
              <span className={`text-2xl font-black font-mono leading-none ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                {timeLeft}s
              </span>
            </div>
          </div>
        </div>

        {/* HTML5 Interactive Game Canvas Container */}
        <div className="flex-grow flex items-center justify-center relative p-6 bg-gradient-to-b from-[#0e0a1f] to-[#040209]">
          
          <div className="relative w-full max-w-[600px] aspect-[4/5] rounded-[40px] overflow-hidden border-4 border-indigo-950 shadow-[0_0_50px_rgba(99,102,241,0.15)] bg-[#040209] flex items-center justify-center">
            
            {/* Holographic transparent Canvas overlay */}
            <canvas 
              ref={canvasRef} 
              width={600} 
              height={750} 
              className="absolute inset-0 w-full h-full z-10 pointer-events-none" 
            />

            {/* Bubble preview box helper */}
            <div className="absolute left-6 bottom-6 bg-slate-900/90 border border-indigo-500/30 p-3 rounded-2xl text-white z-20 flex flex-col items-center gap-1 shadow-2xl backdrop-blur-md">
              <p className="text-[10px] font-black tracking-widest text-[#818cf8]">下發備用彈</p>
              <div 
                className="w-10 h-10 rounded-full border-2 border-white shadow-lg animate-pulse" 
                style={{
                  background: `radial-gradient(circle at 12px 12px, #ffffff 0%, ${nextBulletColor.current} 45%, #050512 100%)`
                }}
              />
              <p className="text-[10px] font-bold text-slate-400 mt-1">{COLOR_NAMES[nextBulletColor.current] || '彩色'}</p>
            </div>

            {/* AI 視覺手勢指引標籤 */}
            <div className="absolute right-6 bottom-6 z-20 bg-slate-900/90 border border-indigo-500/40 px-5 py-3 rounded-2xl text-white shadow-2xl backdrop-blur-md flex items-center gap-3">
              <span className="text-3xl animate-bounce">👌</span>
              <div>
                <p className="text-xs font-black text-indigo-300">AI 視覺手勢辨識中</p>
                <p className="text-[11px] font-bold text-slate-300">食指左右移動瞄準 · 捏住向下拉 · 放開發射</p>
              </div>
            </div>
            
          </div>
          
        </div>

        {/* Bottom Game stats and helpful guides */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center z-10 text-xs font-bold text-slate-400">
          <div>
            <span>設定消除目標：{config.targetCount} 次連擊 | 目前射擊數：{shotsCount} 顆 🎯</span>
          </div>
          <div>
            <span>共計擊破：{bubbleClearedCount} 顆彩色泡泡</span>
          </div>
        </div>

        {/* LOADING & PREPARATION OVERLAY */}
        <AnimatePresence>
          {isInitializing && (
            <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center text-white space-y-6">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <div className="absolute w-28 h-28 border-4 border-indigo-500/10 rounded-full"></div>
                <div className="absolute w-28 h-28 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                
                {/* Custom bouncy bubble animation */}
                <div className="absolute w-12 h-12 bg-gradient-to-tr from-indigo-600 via-pink-500 to-white rounded-full animate-bounce shadow-xl flex items-center justify-center text-2xl">
                  🔮
                </div>
              </div>

              <div className="text-center space-y-2 max-w-sm">
                <h3 className="text-3xl font-black tracking-widest text-indigo-300">手勢辨識加載中</h3>
                <p className="text-indigo-400 font-mono text-sm tracking-widest uppercase animate-pulse">Initializing MediaPipe Hands Engine...</p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  正在啟動您的視訊鏡頭並載入手部關節辨識模型，請將單手舉在鏡頭前準備動作...
                </p>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* ERROR SCREEN */}
        <AnimatePresence>
          {cameraError && (
            <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-white space-y-6">
              <span className="text-7xl">⚠️</span>
              <h3 className="text-3xl font-black text-rose-500">鏡頭存取授權異常</h3>
              <p className="text-slate-400 font-medium max-w-md bg-rose-950/20 border border-rose-500/20 p-4 rounded-2xl leading-relaxed">
                {cameraError}
              </p>
              <p className="text-slate-300 text-sm max-w-md">
                本系統為 100% 電腦視覺辨識遊戲，必須開啟相機鏡頭才能透過肢體動作與手勢進行訓練。
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => window.location.reload()}
                  className="px-8 py-3 bg-indigo-600 rounded-full font-black text-lg shadow-lg active:scale-95 transition"
                >
                  🔄 重新連接鏡頭
                </button>
                <button 
                  onClick={onCancel}
                  className="px-8 py-3 bg-slate-800 rounded-full font-black text-lg shadow-lg hover:bg-slate-750 active:scale-95 transition"
                >
                  返回選單
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* CHALLENGE RESULT PANEL */}
        <AnimatePresence>
          {showResult && (
            <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[40px] p-12 max-w-2xl w-full text-center shadow-[0_0_100px_rgba(255,255,255,0.1)] border-8 border-indigo-500"
              >
                <span className="text-7xl block mb-4 animate-bounce">🏆</span>
                <h2 className="text-5xl font-black text-slate-900 mb-2">精細訓練成果</h2>
                <p className="text-indigo-600 font-black tracking-widest text-lg mb-8 uppercase font-mono">Fine Motor Bubble Shooter Result</p>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="p-8 bg-indigo-50 rounded-[30px] border-4 border-indigo-200">
                    <p className="text-2xl font-bold text-indigo-800 mb-2">最終得分</p>
                    <p className="text-6xl font-black text-indigo-600">{score}</p>
                  </div>
                  <div className="p-8 bg-pink-50 rounded-[30px] border-4 border-pink-200">
                    <p className="text-2xl font-bold text-pink-800 mb-2">極限連刷數</p>
                    <p className="text-6xl font-black text-pink-600">{combo} <span className="text-2xl">Hit</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-10 text-slate-500 font-bold bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                  <div className="text-left flex justify-between items-center">
                    <span>彈弓發射總數：</span>
                    <span className="text-xl font-black text-slate-800">{shotsCount} 次</span>
                  </div>
                  <div className="text-left flex justify-between items-center">
                    <span>累計消除泡泡：</span>
                    <span className="text-xl font-black text-slate-800">{bubbleClearedCount} 顆</span>
                  </div>
                </div>

                <button 
                  onClick={handleEndSubmit}
                  className="w-full py-6 bg-slate-900 hover:bg-slate-800 text-white rounded-[25px] text-3xl font-black transition shadow-2xl shadow-slate-500/20 active:scale-95"
                >
                  💾 儲存並發送今日處分
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>

    </div>
  );
};

export default BubbleShooterGameView;
