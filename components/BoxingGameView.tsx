
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserSettings } from '../types';
import { getPoseInstance, getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  config: { level: 'A' | 'B' | 'C' | 'D', time: number, targetCount: number };
  onComplete: (score: number, details?: any) => void;
  onCancel: () => void;
  speak: (t: string) => void;
}

const BoxingGameView: React.FC<Props> = ({ settings, config, onComplete, onCancel, speak }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.time);
  const [combo, setCombo] = useState(0);
  const [leftPunches, setLeftPunches] = useState(0);
  const [rightPunches, setRightPunches] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [currentSandbag, setCurrentSandbag] = useState<{ type: 'normal' | 'gold', hits: number, maxHits: number, x: number } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameActive = useRef(true);
  const lastActionTime = useRef(0);
  const punchState = useRef({ left: false, right: false });
  const lockedPersonX = useRef<number | null>(null);
  const lastValidLandmarks = useRef<any[] | null>(null);

  const stateRef = useRef({
    score: 0,
    combo: 0,
    leftPunches: 0,
    rightPunches: 0,
    currentSandbag: null as { type: 'normal' | 'gold', hits: number, maxHits: number, x: number } | null,
    gameActive: true
  });

  const spawnSandbag = useCallback(() => {
    const isGold = Math.random() < (config.level === 'A' ? 0.05 : config.level === 'B' ? 0.15 : config.level === 'C' ? 0.3 : 0.45);
    const maxHits = isGold ? 8 : 5;
    // Move targets away from center for better perspective/hit detection
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? (0.15 + Math.random() * 0.25) : (0.6 + Math.random() * 0.25);
    const newSandbag = { type: isGold ? 'gold' : 'normal', hits: 0, maxHits, x };
    stateRef.current.currentSandbag = newSandbag;
    setCurrentSandbag(newSandbag);
  }, [config.level]);

  useEffect(() => {
    if (!currentSandbag && stateRef.current.gameActive) {
      spawnSandbag();
    }
  }, [currentSandbag, spawnSandbag]);

  const latestImageRef = useRef<any>(null);
  const latestLandmarksRef = useRef<any>(null);

  const executePunch = useCallback((side: 'left' | 'right') => {
    if (!stateRef.current.gameActive) return;
    const now = Date.now();
    lastActionTime.current = now;
    if (side === 'left') {
      stateRef.current.leftPunches++;
      setLeftPunches(stateRef.current.leftPunches);
    } else {
      stateRef.current.rightPunches++;
      setRightPunches(stateRef.current.rightPunches);
    }
    handleHit();
  }, []);

  // Continuous animation and render loop
  useEffect(() => {
    let animId: number;
    const renderLoop = () => {
      if (canvasRef.current && stateRef.current.gameActive) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 1. Draw Camera video or Boxing gym background
          if (latestImageRef.current) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
            ctx.drawImage(latestImageRef.current, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            grad.addColorStop(0, '#1e1b4b');
            grad.addColorStop(0.5, '#0f172a');
            grad.addColorStop(1, '#020617');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Ring ropes
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.lineWidth = 4;
            [0.35, 0.5, 0.65].forEach(r => {
              ctx.beginPath();
              ctx.moveTo(0, canvas.height * r);
              ctx.lineTo(canvas.width, canvas.height * r);
              ctx.stroke();
            });
          }

          // 2. Draw Sandbag target
          if (stateRef.current.currentSandbag) {
            const sandbagX = (1 - stateRef.current.currentSandbag.x) * canvas.width;
            const sandbagY = canvas.height * 0.4;
            const progress = stateRef.current.currentSandbag.hits / stateRef.current.currentSandbag.maxHits;

            const fontSize = Math.floor(canvas.width * 0.15);
            ctx.font = `${stateRef.current.currentSandbag.type === 'gold' ? fontSize * 1.2 : fontSize}px Arial`;
            ctx.textAlign = 'center';
            
            const nowTime = Date.now();
            const isHitEffect = (nowTime - lastActionTime.current < 150);
            const shake = isHitEffect ? Math.sin(nowTime/10) * 15 : 0;
            
            ctx.save();
            ctx.translate(sandbagX + shake, sandbagY);
            
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 20;
            
            ctx.fillText(stateRef.current.currentSandbag.type === 'gold' ? '🏆' : '🥊', 0, 0);
            
            // Health Bar
            const barWidth = fontSize * 0.8;
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(-barWidth/2, fontSize * 0.4, barWidth, 12);
            ctx.fillStyle = stateRef.current.currentSandbag.type === 'gold' ? '#facc15' : '#ef4444';
            ctx.fillRect(-barWidth/2, fontSize * 0.4, barWidth * (1 - progress), 12);
            
            if (isHitEffect) {
              ctx.font = `bold ${fontSize * 0.4}px sans-serif`;
              ctx.fillStyle = '#fbbf24';
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 4;
              const bounce = Math.sin(nowTime/50) * 10;
              ctx.strokeText('HIT!', 0, -fontSize * 0.6 + bounce);
              ctx.fillText('HIT!', 0, -fontSize * 0.6 + bounce);
            }
            
            ctx.restore();
          }

          // 3. Draw Arm Vision Skeleton and Boxing Gloves Tracking
          if (latestLandmarksRef.current) {
            const lm = latestLandmarksRef.current;
            const lShoulder = lm[11], lElbow = lm[13], lWrist = lm[15];
            const rShoulder = lm[12], rElbow = lm[14], rWrist = lm[16];

            const drawArm = (shoulder: any, elbow: any, wrist: any, boneColor: string, gloveLabel: string) => {
              if (!shoulder || !elbow || !wrist) return;
              if ((elbow.visibility !== undefined && elbow.visibility < 0.25) || (wrist.visibility !== undefined && wrist.visibility < 0.25)) return;

              const sX = (1 - shoulder.x) * canvas.width;
              const sY = shoulder.y * canvas.height;
              const eX = (1 - elbow.x) * canvas.width;
              const eY = elbow.y * canvas.height;
              const wX = (1 - wrist.x) * canvas.width;
              const wY = wrist.y * canvas.height;

              ctx.save();
              ctx.lineWidth = 10;
              ctx.strokeStyle = boneColor;
              ctx.beginPath();
              ctx.moveTo(sX, sY);
              ctx.lineTo(eX, eY);
              ctx.lineTo(wX, wY);
              ctx.stroke();

              // Joint circles
              [ [sX, sY], [eX, eY] ].forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
              });

              // Boxing Glove overlay at wrist
              ctx.font = '54px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('🥊', wX, wY);

              ctx.font = 'bold 20px sans-serif';
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 6;
              ctx.fillText(gloveLabel, wX, wY - 35);

              ctx.restore();
            };

            drawArm(lShoulder, lElbow, lWrist, '#38bdf8', '左拳');
            drawArm(rShoulder, rElbow, rWrist, '#fb923c', '右拳');
          }
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleHit = () => {
    if (!stateRef.current.currentSandbag) return;
    
    const newHits = stateRef.current.currentSandbag.hits + 1;
    if (newHits >= stateRef.current.currentSandbag.maxHits) {
      const points = stateRef.current.currentSandbag.type === 'gold' ? 10 : 5;
      stateRef.current.score += points;
      setScore(stateRef.current.score);
      stateRef.current.combo += 1;
      setCombo(stateRef.current.combo);
      stateRef.current.currentSandbag = null;
      setCurrentSandbag(null);
      speak("BOOM!");
    } else {
      stateRef.current.currentSandbag = {...stateRef.current.currentSandbag, hits: newHits};
      setCurrentSandbag(stateRef.current.currentSandbag);
    }
  };

  const onResults = (results: any) => {
    if (!stateRef.current.gameActive) return;
    latestImageRef.current = results.image;

    let landmarks = results.poseLandmarks;
    latestLandmarksRef.current = landmarks;

    // --- Subject Binding Logic ---
    if (landmarks) {
      const currentX = landmarks[0].x;
      if (lockedPersonX.current === null) {
        lockedPersonX.current = currentX;
        lastValidLandmarks.current = landmarks;
      } else {
        const dist = Math.abs(currentX - lockedPersonX.current);
        if (dist > 0.25) {
          landmarks = lastValidLandmarks.current;
        } else {
          lockedPersonX.current = currentX;
          lastValidLandmarks.current = landmarks;
        }
      }
    }

    if (landmarks) {
      const calculateAngle = (a: any, b: any, c: any) => {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
      };

      const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];
      const lAngle = calculateAngle(lShoulder, lElbow, lWrist);
      const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
      const rAngle = calculateAngle(rShoulder, rElbow, rWrist);

      const now = Date.now();
      
      const checkPunch = (angle: number, side: 'left' | 'right') => {
        // Arm extension punch: angle > 142 deg
        if (angle > 142 && !punchState.current[side] && now - lastActionTime.current > 160) {
          punchState.current[side] = true;
          executePunch(side);
        } else if (angle < 112) {
          // Arm flexed/bent ready for next punch
          punchState.current[side] = false;
        }
      };

      checkPunch(lAngle, 'left');
      checkPunch(rAngle, 'right');
    }
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
             setCameraError("無法開啟相機。");
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
      gameActive.current = false;
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
          speak(`訓練結束！你的得分是 ${stateRef.current.score} 分。左手出拳 ${stateRef.current.leftPunches} 次，右手出拳 ${stateRef.current.rightPunches} 次。`);
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
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full object-cover z-10" 
          width={settings.layout === 'landscape' ? 1280 : 720} 
          height={settings.layout === 'landscape' ? 720 : 1280} 
        />

        {/* HUD */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none z-30">
          <div className="bg-black/40 backdrop-blur-md p-6 rounded-[30px] border-2 border-white/20 text-white shadow-2xl">
            <h3 className="text-xl font-bold opacity-70">當前得分</h3>
            <p className="text-6xl font-black text-orange-400 leading-none mt-2">{score}</p>
          </div>

          <div className="flex flex-col gap-4 items-center">
            <div className="bg-black/40 backdrop-blur-md p-6 rounded-[30px] border-2 border-white/20 text-white shadow-2xl text-center min-w-[200px]">
              <h3 className="text-xl font-bold opacity-70">剩餘時間</h3>
              <p className={`text-6xl font-black leading-none mt-2 ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {timeLeft}
              </p>
            </div>
            <div className="flex gap-4">
              <div className="bg-blue-600/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-white text-sm font-bold">
                左手彎舉: {leftPunches}
              </div>
              <div className="bg-red-600/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-white text-sm font-bold">
                右手彎舉: {rightPunches}
              </div>
            </div>
          </div>
        </div>

        {/* Center Combo Feedback */}
        <AnimatePresence>
          {combo > 0 && combo % 5 === 0 && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 1 }}
              exit={{ scale: 3, opacity: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            >
              <h2 className="text-9xl font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]">GREAT!!!</h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Vision Motion Guidance */}
        <div className="absolute bottom-10 left-10 z-40 bg-black/70 backdrop-blur-md px-6 py-4 rounded-3xl border-2 border-white/20 text-white flex items-center gap-4">
          <span className="text-4xl animate-bounce">🥊</span>
          <div>
            <h4 className="text-xl font-black text-orange-400">AI 雙臂視覺出拳辨識中</h4>
            <p className="text-slate-300 text-sm font-bold">請在鏡頭前：手臂屈肘蓄力，向前伸直揮拳即可打擊沙包！</p>
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-12 right-12 z-50">
          <button 
            onClick={onCancel}
            className="px-10 py-6 bg-red-600 border-b-8 border-red-900 text-white text-3xl font-black rounded-3xl shadow-2xl hover:bg-red-700 active:scale-95 transition pointer-events-auto"
          >
            結束中斷
          </button>
        </div>

        {showResult && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[40px] p-12 max-w-2xl w-full text-center shadow-[0_0_100px_rgba(255,255,255,0.1)] border-8 border-orange-500"
            >
              <h2 className="text-6xl font-black text-slate-900 mb-8">訓練成果</h2>
              
              <div className="grid grid-cols-2 gap-8 mb-12">
                <div className="p-8 bg-orange-50 rounded-[30px] border-4 border-orange-200">
                  <p className="text-2xl font-bold text-orange-800 mb-2">最終得分</p>
                  <p className="text-7xl font-black text-orange-600">{score}</p>
                </div>
                <div className="p-8 bg-blue-50 rounded-[30px] border-4 border-blue-200">
                  <p className="text-2xl font-bold text-blue-800 mb-2">最高連擊</p>
                  <p className="text-7xl font-black text-blue-600">{combo}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="p-6 bg-slate-50 rounded-[25px] border-2 border-slate-200">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">💪</span>
                    <p className="text-xl font-bold text-slate-600">左手彎舉</p>
                  </div>
                  <p className="text-5xl font-black text-slate-900">{leftPunches} <span className="text-xl">次</span></p>
                </div>
                <div className="p-6 bg-slate-50 rounded-[25px] border-2 border-slate-200">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">💪</span>
                    <p className="text-xl font-bold text-slate-600">右手彎舉</p>
                  </div>
                  <p className="text-5xl font-black text-slate-900">{rightPunches} <span className="text-xl">次</span></p>
                </div>
              </div>

              <button 
                onClick={() => onComplete(score, { leftPunches, rightPunches, combo })}
                className="w-full py-8 bg-slate-900 text-white rounded-[25px] text-4xl font-black hover:bg-slate-800 active:scale-95 transition shadow-2xl shadow-slate-500/20"
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
                    className="px-8 py-4 bg-orange-600 text-white rounded-2xl font-black text-xl active:scale-95 transition shadow-xl"
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
                <div className="w-24 h-24 border-8 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-4xl font-black tracking-widest">AI 視覺拳擊感應中...</p>
                <p className="text-slate-400 text-sm">請站在鏡頭視野正前方準備出拳動作</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BoxingGameView;
