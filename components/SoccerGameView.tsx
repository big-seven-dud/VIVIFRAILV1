
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserSettings } from '../types';
import { getPoseInstance, getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  config: { level: 'A' | 'B' | 'C' | 'D', time: number };
  onComplete: (score: number, details?: any) => void;
  onCancel: () => void;
  speak: (t: string) => void;
}

const SoccerGameView: React.FC<Props> = ({ settings, config, onComplete, onCancel, speak }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.time);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [obstaclePos, setObstaclePos] = useState<'left' | 'right'>(Math.random() > 0.5 ? 'left' : 'right');
  const [showResult, setShowResult] = useState(false);
  const [goals, setGoals] = useState(0);
  const [misses, setMisses] = useState(0);
  const [legsVisible, setLegsVisible] = useState(true);
  const [legStatus, setLegStatus] = useState({ left: '準備中', right: '準備中', lAngle: 180, rAngle: 180 });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameActive = useRef(true);
  const lastActionTime = useRef(0);
  const latestImageRef = useRef<any>(null);
  const latestLandmarksRef = useRef<any>(null);
  
  // 雙腿彎曲與伸直判定狀態機 (支援站姿蓄力踢球與坐姿伸展抬膝)
  const legTracking = useRef({
    left: { isBent: false, minAngle: 180, lastAngle: 180, bendTime: 0 },
    right: { isBent: false, minAngle: 180, lastAngle: 180, bendTime: 0 }
  });

  // 飛行動畫狀態
  const ballAnim = useRef<{
    active: boolean;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    startX: number;
    startY: number;
    progress: number;
    result: 'GOAL' | 'MISS';
  }>({
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    startX: 0,
    startY: 0,
    progress: 0,
    result: 'GOAL'
  });

  const stateRef = useRef({
    score: 0,
    goals: 0,
    misses: 0,
    obstaclePos: obstaclePos,
    gameActive: true
  });

  // 繪製骨架關節輔助線 (在鏡像座標中 (1 - x) * width)
  const drawLegSkeleton = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, hip: any, knee: any, ankle: any, angle: number, isBent: boolean, label: string) => {
    const hX = (1 - hip.x) * canvas.width;
    const hY = hip.y * canvas.height;
    const kX = (1 - knee.x) * canvas.width;
    const kY = knee.y * canvas.height;
    const aX = (1 - ankle.x) * canvas.width;
    const aY = ankle.y * canvas.height;

    ctx.save();
    ctx.lineWidth = 8;
    // 彎曲蓄力時為醒目亮黃色，伸直或踢出時為綠色
    ctx.strokeStyle = isBent ? '#facc15' : '#22c55e';
    ctx.beginPath();
    ctx.moveTo(hX, hY);
    ctx.lineTo(kX, kY);
    ctx.lineTo(aX, aY);
    ctx.stroke();

    // 繪製關節圓點
    [ [hX, hY], [kX, kY], [aX, aY] ].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = isBent ? '#facc15' : '#22c55e';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });

    // 標記角度與狀態字樣
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.textAlign = 'center';
    ctx.fillText(`${label}: ${Math.round(angle)}°`, kX, kY - 20);
    if (isBent) {
      ctx.fillStyle = '#facc15';
      ctx.fillText(`⚡ 蓄力中`, kX, kY + 35);
    }
    ctx.restore();
  };

  // Continuous animation and render loop
  useEffect(() => {
    let animId: number;
    const renderLoop = () => {
      if (canvasRef.current && stateRef.current.gameActive) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 1. Draw video feed or football stadium grass
          if (latestImageRef.current) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
            ctx.drawImage(latestImageRef.current, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            const grassGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            grassGrad.addColorStop(0, '#064e3b');
            grassGrad.addColorStop(0.5, '#047857');
            grassGrad.addColorStop(1, '#065f46');
            ctx.fillStyle = grassGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Stripes
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            for (let i = 0; i < canvas.width; i += 80) {
              if (Math.floor(i / 80) % 2 === 0) {
                ctx.fillRect(i, 0, 80, canvas.height);
              }
            }

            // Penalty box markings
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.strokeRect(canvas.width * 0.15, canvas.height * 0.45, canvas.width * 0.7, canvas.height * 0.45);
          }

          // 2. Draw goal UI & Goalkeeper
          drawSoccerUI(ctx, canvas);

          // 3. Draw leg skeleton if landmarks exist
          if (latestLandmarksRef.current) {
            const lm = latestLandmarksRef.current;
            const lHip = lm[23], lKnee = lm[25], lAnkle = lm[27];
            const rHip = lm[24], rKnee = lm[26], rAnkle = lm[28];
            if (lHip && lKnee && lAnkle && (lKnee.visibility === undefined || lKnee.visibility > 0.25)) {
              drawLegSkeleton(ctx, canvas, lHip, lKnee, lAnkle, legStatus.lAngle, legTracking.current.left.isBent, '左腳');
            }
            if (rHip && rKnee && rAnkle && (rKnee.visibility === undefined || rKnee.visibility > 0.25)) {
              drawLegSkeleton(ctx, canvas, rHip, rKnee, rAnkle, legStatus.rAngle, legTracking.current.right.isBent, '右腳');
            }
          }

          // 4. Update & draw flying ball
          updateAndDrawBall(ctx, canvas);
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [legStatus.lAngle, legStatus.rAngle]);

  const onResults = (results: any) => {
    if (!stateRef.current.gameActive) return;
    latestImageRef.current = results.image;

    let landmarks = results.poseLandmarks;
    latestLandmarksRef.current = landmarks;

    // 3. 雙腿關節追蹤與判定
    if (landmarks) {
      const lHip = landmarks[23], lKnee = landmarks[25], lAnkle = landmarks[27];
      const rHip = landmarks[24], rKnee = landmarks[26], rAnkle = landmarks[28];
      
      const hasLeftLeg = lHip && lKnee && lAnkle && (lKnee.visibility === undefined || lKnee.visibility > 0.25);
      const hasRightLeg = rHip && rKnee && rAnkle && (rKnee.visibility === undefined || rKnee.visibility > 0.25);

      setLegsVisible(Boolean(hasLeftLeg || hasRightLeg));

      const calculateAngle = (a: any, b: any, c: any) => {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
      };

      const now = Date.now();
      let lAngle = 180;
      let rAngle = 180;

      // 檢查左腿
      if (hasLeftLeg) {
        lAngle = calculateAngle(lHip, lKnee, lAnkle);
        const lState = legTracking.current.left;

        // 彎曲判定：角度小於 140°，即視為蓄力中 (坐姿時通常在 90°~120°，站姿屈膝蓄力在 110°~135°)
        if (lAngle < 140) {
          if (!lState.isBent) {
            lState.isBent = true;
            lState.bendTime = now;
            lState.minAngle = lAngle;
          } else {
            lState.minAngle = Math.min(lState.minAngle, lAngle);
          }
        } 
        // 伸直判定：從蓄力狀態快速伸直，角度恢復到 >= 155° (或相較最小角度伸展超過 35°)
        else if (lState.isBent && (lAngle >= 155 || (lAngle - lState.minAngle >= 35))) {
          if (now - lastActionTime.current > 1000) {
            lastActionTime.current = now;
            handleKick('left');
          }
          lState.isBent = false;
          lState.minAngle = 180;
        }
      }

      // 檢查右腿
      if (hasRightLeg) {
        rAngle = calculateAngle(rHip, rKnee, rAnkle);
        const rState = legTracking.current.right;

        if (rAngle < 140) {
          if (!rState.isBent) {
            rState.isBent = true;
            rState.bendTime = now;
            rState.minAngle = rAngle;
          } else {
            rState.minAngle = Math.min(rState.minAngle, rAngle);
          }
        } 
        else if (rState.isBent && (rAngle >= 155 || (rAngle - rState.minAngle >= 35))) {
          if (now - lastActionTime.current > 1000) {
            lastActionTime.current = now;
            handleKick('right');
          }
          rState.isBent = false;
          rState.minAngle = 180;
        }
      }

      setLegStatus({
        left: legTracking.current.left.isBent ? '⚡ 彎曲蓄力中' : '伸直就緒',
        right: legTracking.current.right.isBent ? '⚡ 彎曲蓄力中' : '伸直就緒',
        lAngle: Math.round(lAngle),
        rAngle: Math.round(rAngle)
      });
    } else {
      setLegsVisible(false);
    }
  };

  const drawSoccerUI = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // 1. Draw Goal Frame
    const goalW = canvas.width * 0.76;
    const goalH = canvas.height * 0.36;
    const goalX = (canvas.width - goalW) / 2;
    const goalY = 60;
    
    // Goal Net Backdrop
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(goalX, goalY, goalW, goalH);

    // Goal Net Pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = goalX; i <= goalX + goalW; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, goalY); ctx.lineTo(i, goalY + goalH); ctx.stroke();
    }
    for (let j = goalY; j <= goalY + goalH; j += 28) {
      ctx.beginPath(); ctx.moveTo(goalX, j); ctx.lineTo(goalX + goalW, j); ctx.stroke();
    }

    // Solid Goal Frame Posts
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeRect(goalX, goalY, goalW, goalH);

    // 2. Draw Obstacle (Goalkeeper / Gloves)
    const obsW = goalW / 2;
    const obsX = stateRef.current.obstaclePos === 'left' ? goalX : goalX + obsW;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'; 
    ctx.fillRect(obsX + 8, goalY + 8, obsW - 16, goalH - 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🧤', obsX + obsW/2, goalY + goalH/2 + 10);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('守門員防守區', obsX + obsW/2, goalY + goalH/2 + 45);

    // Open Net Prompt
    const openX = stateRef.current.obstaclePos === 'left' ? goalX + obsW : goalX;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.fillRect(openX + 8, goalY + 8, obsW - 16, goalH - 16);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('⭐ 空門瞄準點', openX + obsW/2, goalY + goalH/2 + 10);

    // 3. 靜止足球 (當未在飛行中時顯示於底部)
    if (!ballAnim.current.active) {
      const ballX = canvas.width / 2;
      const ballY = canvas.height * 0.88;
      ctx.font = '86px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('⚽', ballX, ballY);
    }
    
    // Bottom Ground Line
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height * 0.9);
    ctx.lineTo(canvas.width, canvas.height * 0.9);
    ctx.stroke();
  };

  const updateAndDrawBall = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const anim = ballAnim.current;
    if (!anim.active) return;

    anim.progress += 0.08;
    if (anim.progress >= 1) {
      anim.active = false;
      return;
    }

    // 拋物線軌跡插值
    const curX = anim.startX + (anim.targetX - anim.startX) * anim.progress;
    const curY = anim.startY + (anim.targetY - anim.startY) * anim.progress - Math.sin(anim.progress * Math.PI) * 120;
    
    // 遠近縮小透視
    const scale = 1 - anim.progress * 0.45;

    ctx.save();
    ctx.translate(curX, curY);
    ctx.scale(scale, scale);
    ctx.font = '80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚽', 0, 0);
    ctx.restore();
  };

  const handleKick = (side: 'left' | 'right') => {
    if (!stateRef.current.gameActive) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const goalW = canvas.width * 0.76;
    const goalH = canvas.height * 0.36;
    const goalX = (canvas.width - goalW) / 2;
    const goalY = 60;
    const obsW = goalW / 2;

    // 鏡像對應：長輩出「左腳」在鏡頭右側，足球射向球門右半側；長輩出「右腳」在鏡頭左側，射向左半側
    const targetScreenSide = side === 'left' ? 'right' : 'left';
    const hitObstacle = stateRef.current.obstaclePos === targetScreenSide;

    const targetX = targetScreenSide === 'left' ? goalX + obsW * 0.5 : goalX + obsW * 1.5;
    const targetY = goalY + goalH * 0.5;

    // 啟動足球飛行動畫
    ballAnim.current = {
      active: true,
      x: canvas.width / 2,
      y: canvas.height * 0.88,
      startX: canvas.width / 2,
      startY: canvas.height * 0.88,
      targetX,
      targetY,
      progress: 0,
      result: hitObstacle ? 'MISS' : 'GOAL'
    };

    if (hitObstacle) {
      setFeedback('MISS');
      stateRef.current.misses++;
      setMisses(stateRef.current.misses);
      speak("被守門員擋下了！沒得分，換邊再踢！");
    } else {
      setFeedback('GOAL');
      stateRef.current.score += 10;
      stateRef.current.goals++;
      setScore(stateRef.current.score);
      setGoals(stateRef.current.goals);
      speak("射門進球！得分！");
    }

    // 隨機切換守門員防守側，考驗左右腳換腳踢
    const newPos = Math.random() > 0.5 ? 'left' : 'right';
    stateRef.current.obstaclePos = newPos;
    setObstaclePos(newPos);
    setTimeout(() => setFeedback(null), 1200);
  };

  const onResultsRef = useRef<any>(null);
  onResultsRef.current = onResults;

    useEffect(() => {
    let isMounted = true;
    let camera: any = null;
    let pose: any = null;

    const initAll = () => {
      const pose = getPoseInstance();
      const CameraClass = getCameraClass();

      if (pose && CameraClass && videoRef.current && !camera) {
        pose.onResults((res: any) => onResultsRef.current?.(res));
        
        const width = settings.layout === 'landscape' ? 640 : 480;
        const height = settings.layout === 'landscape' ? 480 : 640;

        camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            if (!isMounted) return;
            const currentPose = getPoseInstance();
            if (videoRef.current && currentPose && videoRef.current.readyState >= 2) {
              try {
                await currentPose.send({ image: videoRef.current });
              } catch (e) {}
            }
          },
          width,
          height
        });

        camera.start()
          .then(() => setIsInitializing(false))
          .catch((err: any) => {
            console.error(err);
            setCameraError("未偵測到鏡頭或權限被拒。您仍可透過下方按鈕或鍵盤直接踢球！");
            setIsInitializing(false);
          });
        return true;
      }
      return false;
    };

    let retryInterval: any;
    const checkInit = () => {
      if (initAll()) {
        if (retryInterval) clearInterval(retryInterval);
      }
    };

    if (!initAll()) {
      retryInterval = setInterval(checkInit, 500);
    }
    return () => {
      isMounted = false;
      if (retryInterval) clearInterval(retryInterval);
      stateRef.current.gameActive = false;
      if (camera) camera.stop();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          stateRef.current.gameActive = false;
          setShowResult(true);
          speak(`訓練結束！你的得分是 ${stateRef.current.score} 分。成功射門 ${stateRef.current.goals} 次。`);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [speak]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      <div className="relative w-full h-full">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover camera-mirror" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10" 
          width={settings.layout === 'landscape' ? 1280 : 720} height={settings.layout === 'landscape' ? 720 : 1280} />

        {/* HUD */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none z-30">
          <div className="bg-black/60 backdrop-blur-md p-6 rounded-[30px] border-2 border-white/20 text-white shadow-2xl">
            <h3 className="text-xl font-bold opacity-70">得分</h3>
            <p className="text-7xl font-black text-green-400 leading-none mt-2">{score}</p>
          </div>

          {/* 腿部即時彎曲與伸直狀態面板 */}
          <div className="flex gap-4 bg-black/60 backdrop-blur-md p-4 rounded-[28px] border-2 border-white/20 text-white shadow-2xl">
            <div className={`px-5 py-3 rounded-2xl border text-center ${legStatus.left.includes('蓄力') ? 'bg-amber-500/30 border-amber-400' : 'bg-slate-800/60 border-slate-600'}`}>
              <div className="text-sm font-semibold opacity-80">左腿膝角</div>
              <div className="text-3xl font-black text-yellow-300">{legStatus.lAngle}°</div>
              <div className="text-xs mt-1 font-bold">{legStatus.left}</div>
            </div>
            <div className={`px-5 py-3 rounded-2xl border text-center ${legStatus.right.includes('蓄力') ? 'bg-amber-500/30 border-amber-400' : 'bg-slate-800/60 border-slate-600'}`}>
              <div className="text-sm font-semibold opacity-80">右腿膝角</div>
              <div className="text-3xl font-black text-yellow-300">{legStatus.rAngle}°</div>
              <div className="text-xs mt-1 font-bold">{legStatus.right}</div>
            </div>
          </div>

          <div className="bg-black/60 backdrop-blur-md p-6 rounded-[30px] border-2 border-white/20 text-white shadow-2xl text-center min-w-[200px]">
            <h3 className="text-xl font-bold opacity-70">倒數</h3>
            <p className={`text-7xl font-black leading-none mt-2 ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{timeLeft}</p>
          </div>
        </div>

        {/* 鏡頭視野提示 (若膝蓋未入鏡時顯示) */}
        {!legsVisible && !isInitializing && (
          <div className="absolute top-36 left-1/2 -translate-x-1/2 z-40 bg-amber-500/90 text-slate-950 font-bold px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
            <span className="text-2xl">📸</span>
            <span>未偵測到雙腳：請將鏡頭略朝下照到膝蓋與雙腳（坐姿踢腿或站姿屈膝伸直皆可）</span>
          </div>
        )}

        {/* Goal Feedback */}
        <AnimatePresence>
          {feedback && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40"
            >
              <h2 className={`text-9xl font-black italic tracking-tighter ${feedback === 'GOAL' ? 'text-yellow-400 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]' : 'text-red-500 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]'}`}>
                {feedback}!!
              </h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Vision Motion Guidance */}
        <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end z-40">
          <div className="bg-black/70 backdrop-blur-md px-8 py-5 rounded-3xl border-2 border-white/20 text-white flex items-center gap-4">
            <span className="text-4xl animate-bounce">🦵</span>
            <div>
              <h4 className="text-xl font-black text-green-400">AI 雙腿視覺踢球辨識中</h4>
              <p className="text-slate-300 text-sm font-bold">請在鏡頭前：左腿或右腿屈膝蓄力，向前伸直踢腿即可完成射門！</p>
            </div>
          </div>

          <button onClick={onCancel} className="px-8 py-5 bg-red-600 text-white text-2xl font-black rounded-3xl shadow-2xl border-b-6 border-red-900 active:scale-95 transition">結束中斷</button>
        </div>

        {showResult && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[40px] p-12 max-w-2xl w-full text-center shadow-2xl border-8 border-green-500"
            >
              <h2 className="text-6xl font-black text-slate-900 mb-8">足球測驗成果</h2>
              
              <div className="grid grid-cols-2 gap-8 mb-12">
                <div className="p-8 bg-green-50 rounded-[30px] border-4 border-green-200">
                  <p className="text-2xl font-bold text-green-800 mb-2">最終得分</p>
                  <p className="text-7xl font-black text-green-600">{score}</p>
                </div>
                <div className="p-8 bg-blue-50 rounded-[30px] border-4 border-blue-200">
                  <p className="text-2xl font-bold text-blue-800 mb-2">射門次數</p>
                  <p className="text-7xl font-black text-blue-600">{goals + misses}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="p-6 bg-slate-50 rounded-[25px] border-2 border-slate-200">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">⚽</span>
                    <p className="text-xl font-bold text-slate-600">成功進球</p>
                  </div>
                  <p className="text-5xl font-black text-green-600">{goals} <span className="text-xl">次</span></p>
                </div>
                <div className="p-6 bg-slate-50 rounded-[25px] border-2 border-slate-200">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">🧤</span>
                    <p className="text-xl font-bold text-slate-600">撞擊障礙</p>
                  </div>
                  <p className="text-5xl font-black text-red-600">{misses} <span className="text-xl">次</span></p>
                </div>
              </div>

              <button 
                onClick={() => onComplete(score, { goals, misses })}
                className="w-full py-8 bg-slate-900 text-white rounded-[25px] text-4xl font-black hover:bg-slate-800 active:scale-95 transition shadow-2xl"
              >
                確認並返回
              </button>
            </motion.div>
          </div>
        )}

        {(isInitializing || cameraError) && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-white space-y-6 z-50 p-8 text-center max-w-lg mx-auto">
            {cameraError ? (
              <>
                <div className="text-8xl">⚠️</div>
                <p className="text-2xl font-black">{cameraError}</p>
                <p className="text-slate-300 text-base">本系統所有遊戲均由 AI 鏡頭視覺辨識進行動作偵測，請確認鏡頭連接正常且允許存取。</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xl active:scale-95 transition shadow-xl"
                  >
                    🔄 重新連接鏡頭
                  </button>
                  <button 
                    onClick={onCancel}
                    className="px-8 py-4 bg-slate-700 text-white rounded-2xl font-black text-xl active:scale-95 transition"
                  >
                    返回選單
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-24 h-24 border-8 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-4xl font-black">AI 視覺踢球感應中...</p>
                <p className="text-slate-400 text-sm">請將鏡頭略朝下照到膝蓋與雙腳，準備踢球動作</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SoccerGameView;
