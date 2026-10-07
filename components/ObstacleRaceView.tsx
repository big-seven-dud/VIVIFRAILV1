
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { UserSettings } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { getPoseInstance, getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  config: { level: 'A' | 'B' | 'C' | 'D', count: number, mode: 'normal' | 'jogging', bpm?: number, time?: number };
  onComplete: (score: number, details?: any) => void;
  onCancel: () => void;
  speak: (t: string) => void;
}

type ObstacleType = 'punch' | 'sit-stand';

interface GameObstacle {
  id: number;
  type: ObstacleType;
  status: 'pending' | 'cleared' | 'failed';
  triggerProgress?: number; // 0-100 progress when this obstacle appears
}

const ObstacleRaceView: React.FC<Props> = ({ settings, config, onComplete, onCancel, speak }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [obstacles, setObstacles] = useState<GameObstacle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showComboEffect, setShowComboEffect] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);
  const [jogProgress, setJogProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.time || 30);
  const [isWaitingForObstacle, setIsWaitingForObstacle] = useState(false);
  const [currentPulse, setCurrentPulse] = useState(false);
  const [actionStats, setActionStats] = useState<Record<ObstacleType, number>>({
    'punch': 0,
    'sit-stand': 0
  });

  // Metronome effect for jogging mode
  useEffect(() => {
    if (config.mode === 'jogging' && config.bpm && !showResult) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const interval = 60000 / config.bpm;
      const timer = setInterval(() => {
        setCurrentPulse(true);
        
        // Play subtle metronome tick
        try {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1000, audioCtx.currentTime); 
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
          
          osc.start();
          osc.stop(audioCtx.currentTime + 0.1);
        } catch (e) {}

        setTimeout(() => setCurrentPulse(false), 150);
      }, interval);
      return () => {
        clearInterval(timer);
        audioCtx.close();
      };
    }
  }, [config.mode, config.bpm, showResult]);

  const stateRef = useRef({
    currentIndex: 0,
    isPunchExtended: false,
    isStanding: false,
    isSquatted: false,
    shoulderBaselineY: null as number | null,
    isKickBent: false,
    isAnkleAtPeak: false,
    ankleBaselineY: null as number | null,
    jogProgress: 0,
    isWaitingForObstacle: false,
    startTime: Date.now(),
    lastCountTime: Date.now(),
    lastActionTime: 0,
    combo: 0,
    lockedPersonX: null as number | null,
    lastValidLandmarks: null as any[] | null,
    obstacles: [] as GameObstacle[],
    config: config,
    stats: {
      'punch': 0,
      'sit-stand': 0
    },
    gameActive: true
  });

  // Initialize obstacles
  useEffect(() => {
    stateRef.current.config = config;
    const types: ObstacleType[] = ['punch', 'sit-stand']; // Removed kick
    
    // In jogging mode, we distribute obstacles throughout 100% progress
    const newObstacles: GameObstacle[] = Array.from({ length: config.count }).map((_, i) => ({
      id: i,
      type: types[Math.floor(Math.random() * types.length)],
      status: 'pending',
      triggerProgress: config.mode === 'jogging' ? (i + 1) * (100 / (config.count + 1)) : undefined
    }));
    
    setObstacles(newObstacles);
    stateRef.current.obstacles = newObstacles;
    stateRef.current.isWaitingForObstacle = false; // Initially false to let progress start
    setIsWaitingForObstacle(false);
    
    speak(config.mode === 'jogging' ? `超慢跑開始！請跟著節奏原地踏步。` : `遊戲開始！準備！`);
  }, [config]);

  const triggerClearing = useCallback((index: number) => {
    const now = Date.now();
    if (now - stateRef.current.lastActionTime < 1000) return; // Debounce
    stateRef.current.lastActionTime = now;

    setObstacles(prev => {
      const next = [...prev];
      const obstacle = next[index];
      if (obstacle && obstacle.status === 'pending') {
        obstacle.status = 'cleared';
        
        // Update stats
        stateRef.current.stats[obstacle.type]++;
        setActionStats({...stateRef.current.stats});

        // Handle Combo
        const newCombo = stateRef.current.combo + 1;
        stateRef.current.combo = newCombo;
        setCombo(newCombo);
        
        if (newCombo >= 3) {
          setShowComboEffect(true);
          setTimeout(() => setShowComboEffect(false), 1000);
          if (newCombo % 3 === 0) {
            const praises = ["太厲害了！", "身手矯健！", "完美的動作！", "充滿活力！"];
            speak(praises[Math.floor(Math.random() * praises.length)]);
          }
        } else {
          speak("嘿！");
        }
      }
      return next;
    });

    const nextIdx = index + 1;
    stateRef.current.currentIndex = nextIdx;
    setCurrentIndex(nextIdx);
    
    // In jogging mode, after clearing an obstacle, we resume jogging
    if (stateRef.current.config.mode === 'jogging') {
      stateRef.current.isWaitingForObstacle = false;
      setIsWaitingForObstacle(false);
      speak("關卡通過！繼續慢跑！");
    }

    if (nextIdx >= config.count) {
      stateRef.current.gameActive = false;
      setShowResult(true);
      speak(`恭喜完成！你的最高連擊是 ${stateRef.current.combo}。`);
    }
  }, [config.count, speak]);

  // Reliable interval for jogging progress update
  useEffect(() => {
    if (config.mode !== 'jogging' || showResult) return;
    const interval = setInterval(() => {
      if (!stateRef.current.gameActive) return;
      const now = Date.now();
      const dt = (now - stateRef.current.lastCountTime) / 1000;
      stateRef.current.lastCountTime = now;
      
      const totalTime = stateRef.current.config.time || 30;
      const progressInc = (100 / totalTime) * dt;

      const activeObstacle = stateRef.current.obstacles[stateRef.current.currentIndex];
      const nextTrigger = activeObstacle?.triggerProgress || 100;

      if (!stateRef.current.isWaitingForObstacle && stateRef.current.jogProgress < 100) {
        stateRef.current.jogProgress = Math.min(nextTrigger, stateRef.current.jogProgress + progressInc);
        setJogProgress(stateRef.current.jogProgress);
        
        const remaining = Math.max(0, Math.ceil(totalTime * (1 - stateRef.current.jogProgress / 100)));
        setTimeLeft(remaining);

        if (stateRef.current.jogProgress >= nextTrigger && activeObstacle) {
          stateRef.current.isWaitingForObstacle = true;
          setIsWaitingForObstacle(true);
          const actionLabel = activeObstacle.type === 'punch' ? '向上打擊' : '向上翻越';
          speak(`前方有障礙！請${actionLabel}！`);
        }
      }
      
      if (stateRef.current.jogProgress >= 100 && !activeObstacle) {
        stateRef.current.gameActive = false;
        setShowResult(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [config.mode, showResult, speak]);

  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let landmarks = results.poseLandmarks;

    // Draw Camera Frame to Canvas (MUST be before landmark logic/return)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // --- Subject Binding Logic ---
    if (landmarks) {
      const currentX = landmarks[0].x; // Use nose as reference
      if (stateRef.current.lockedPersonX === null) {
        stateRef.current.lockedPersonX = currentX;
        stateRef.current.lastValidLandmarks = landmarks;
      } else {
        const distFromLocked = Math.abs(currentX - stateRef.current.lockedPersonX);
        if (stateRef.current.lockedPersonX !== null) {
           if (distFromLocked > 0.4) {
              // Try to ignore the jump if it's too big
              landmarks = stateRef.current.lastValidLandmarks;
           } else {
              stateRef.current.lockedPersonX = currentX;
              stateRef.current.lastValidLandmarks = landmarks;
           }
        }
      }
    }

    if (!landmarks) return;
    
    const activeObstacle = stateRef.current.obstacles[stateRef.current.currentIndex];
    const now = Date.now();

    // Landmark references
    const lShoulder = landmarks[11], rShoulder = landmarks[12];
    const lHip = landmarks[23], rHip = landmarks[24];
    const lWrist = landmarks[15], rWrist = landmarks[16];
    const lKnee = landmarks[25], rKnee = landmarks[26];
    const lAnkle = landmarks[27], rAnkle = landmarks[28];
    const nose = landmarks[0];
    const hipY = (lHip.y + rHip.y) / 2;

    const calculateAngle = (a: any, b: any, c: any) => {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      if (angle > 180.0) angle = 360 - angle;
      return angle;
    };

    // --- Super Slow Jogging Logic (Automatic Progress) ---
    if (stateRef.current.config.mode === 'jogging') {
      const dt = (now - stateRef.current.lastCountTime) / 1000;
      stateRef.current.lastCountTime = now;
      
      const totalTime = stateRef.current.config.time || 30;
      const progressInc = (100 / totalTime) * dt;

      const activeObstacle = stateRef.current.obstacles[stateRef.current.currentIndex];
      const nextTrigger = activeObstacle?.triggerProgress || 100;

      if (!stateRef.current.isWaitingForObstacle && stateRef.current.jogProgress < 100) {
        stateRef.current.jogProgress = Math.min(nextTrigger, stateRef.current.jogProgress + progressInc);
        setJogProgress(stateRef.current.jogProgress);
        
        const remaining = Math.max(0, Math.ceil(totalTime * (1 - stateRef.current.jogProgress / 100)));
        if (remaining !== timeLeft) setTimeLeft(remaining);

        if (stateRef.current.jogProgress >= nextTrigger && activeObstacle) {
          stateRef.current.isWaitingForObstacle = true;
          setIsWaitingForObstacle(true);
          const actionLabel = activeObstacle.type === 'punch' ? '向上打擊' : '向上翻越';
          speak(`前方有障礙！請${actionLabel}！`);
        }
      }
      
      // Draw Jogging Progress on Screen
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(50, canvas.height - 100, canvas.width - 100, 40);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(50, canvas.height - 100, (stateRef.current.jogProgress / 100) * (canvas.width - 100), 40);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(`慢跑進度: ${Math.floor(stateRef.current.jogProgress)}% | 剩餘時間: ${timeLeft}秒`, canvas.width/2, canvas.height - 110);

      if (stateRef.current.jogProgress >= 100 && !activeObstacle) {
        stateRef.current.gameActive = false;
        setShowResult(true);
      }
    } else {
        stateRef.current.lastCountTime = now;
    }

    // Only process obstacle detection if NOT waiting for jogging
    const isAtObstacle = stateRef.current.config.mode === 'jogging' 
      ? stateRef.current.isWaitingForObstacle 
      : true;

    if (activeObstacle && (isAtObstacle || stateRef.current.config.mode === 'normal')) {
      // 1. OVERHEAD STRIKE (向上打擊：雙手或單手過頭上擊)
      if (activeObstacle.type === 'punch') {
        const leftWristY = (lWrist && (lWrist.visibility === undefined || lWrist.visibility > 0.25)) ? lWrist.y : 1;
        const rightWristY = (rWrist && (rWrist.visibility === undefined || rWrist.visibility > 0.25)) ? rWrist.y : 1;
        const higherWristY = Math.min(leftWristY, rightWristY);

        const targetLX = (1 - (lShoulder?.x || 0.35)) * canvas.width;
        const targetRX = (1 - (rShoulder?.x || 0.65)) * canvas.width;
        
        ctx.save();
        ctx.font = '110px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⭐', targetLX, 140);
        ctx.fillText('⭐', targetRX, 140);

        // Visual hint on camera feed
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillText('雙手或單手向上高舉擊打！', canvas.width / 2, 220);
        ctx.restore();

        // Check if hand reaches higher than nose level
        if (higherWristY < nose.y - 0.02 && !stateRef.current.isPunchExtended) {
          stateRef.current.isPunchExtended = true;
          triggerClearing(stateRef.current.currentIndex);
        } else if (higherWristY > nose.y + 0.08 && stateRef.current.isPunchExtended) {
          stateRef.current.isPunchExtended = false;
        }
      }

      // 2. SIT-STAND / SIT-LIFT (低矮牆壁：起立躍進 / 坐站動作)
      if (activeObstacle.type === 'sit-stand') {
        const leftShoulderY = lShoulder?.y || 0.45;
        const rightShoulderY = rShoulder?.y || 0.45;
        const shoulderY = (leftShoulderY + rightShoulderY) / 2;
        
        // Ensure shoulder baseline is calibrated
        if (stateRef.current.shoulderBaselineY === null && (lShoulder?.visibility > 0.5 || rShoulder?.visibility > 0.5)) {
          stateRef.current.shoulderBaselineY = shoulderY;
        }
        const baselineY = stateRef.current.shoulderBaselineY || 0.45;

        // Fixed blue area centered at baselineY * canvas.height (representing standing shoulder axis)
        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.fillRect(0, (baselineY * canvas.height) - 60, canvas.width, 120);
        
        ctx.font = 'bold 44px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(stateRef.current.isSquatted ? '⚡ 很好！現在請站起起立！' : '🧱 向下深蹲或坐下，再站立翻越！', canvas.width/2, (baselineY * canvas.height) + 15);

        const lowerLimit = baselineY + 0.06;
        const upperLimit = baselineY + 0.02;

        if (shoulderY > lowerLimit && !stateRef.current.isSquatted) {
          stateRef.current.isSquatted = true;
        } else if (shoulderY < upperLimit && stateRef.current.isSquatted) {
          stateRef.current.isSquatted = false;
          triggerClearing(stateRef.current.currentIndex);
        }
      }
    }

    // Draw Skeleton
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]].forEach(([i, j]) => {
      const li = landmarks[i], lj = landmarks[j];
      if (li && lj && li.visibility > 0.5 && lj.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo((1 - li.x) * canvas.width, li.y * canvas.height);
        ctx.lineTo((1 - lj.x) * canvas.width, lj.y * canvas.height);
        ctx.stroke();
      }
    });

  }, [triggerClearing]);

  // Detector setup
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
            setCameraError("無法開啟相機，請檢查權限設定。");
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
      if (camera) camera.stop();
    };
  }, []);

  const activeObstacle = obstacles[currentIndex];

  const getObstacleData = (type: ObstacleType) => {
    switch(type) {
      case 'punch': return { label: '向上打擊', icon: '⭐', color: 'text-yellow-400', action: '雙手向上擊打上方目標' };
      case 'sit-stand': return { label: '起身躍進', icon: '🧱', color: 'text-blue-600', action: config.level === 'A' ? '坐姿抬腿' : '雙手放下，迅速完成起立' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden relative">
      {/* HUD - Goal & Score */}
      <div className="absolute top-10 left-10 z-30 flex flex-col gap-4">
        <div className="bg-white/90 backdrop-blur-md px-8 py-5 rounded-[30px] shadow-2xl flex flex-col border-4 border-blue-600 min-w-[200px]">
          <span className="text-sm font-black text-slate-500 uppercase tracking-widest mb-1">測驗進度</span>
          <span className="text-5xl font-black text-slate-800">{currentIndex} <span className="text-2xl text-slate-400">/ {config.count}</span></span>
        </div>
        
        {config.mode === 'jogging' && (
          <div className="bg-blue-600 px-8 py-4 rounded-[30px] text-white shadow-2xl flex flex-col items-center border-4 border-blue-400">
            <span className="text-sm font-black uppercase tracking-widest mb-1">剩餘時間</span>
            <span className="text-4xl font-black">{timeLeft}s</span>
          </div>
        )}

        <div className="bg-orange-500 px-8 py-4 rounded-[30px] text-white shadow-2xl flex flex-col items-center border-4 border-orange-400">
          <span className="text-sm font-black uppercase tracking-widest mb-1">今日連擊</span>
          <span className="text-4xl font-black">{combo}</span>
        </div>
      </div>

      {/* BPM Visual Indicator */}
      {config.mode === 'jogging' && !showResult && !isWaitingForObstacle && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
           <div className={`w-32 h-32 rounded-full border-[12px] transition-all duration-150 flex items-center justify-center shadow-2xl ${currentPulse ? 'scale-110 border-emerald-400 bg-emerald-500 text-white' : 'scale-95 border-emerald-900/50 bg-black/60 text-emerald-500'}`}>
              <span className="text-6xl">👟</span>
           </div>
           <div className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-full font-black text-xl shadow-lg animate-pulse">
              請跟著節奏原地踏步
           </div>
        </div>
      )}

      {/* Action Instructions Overlay - Centered Bottom */}
      <div className="absolute bottom-12 left-12 right-12 z-30 flex justify-between items-end pointer-events-none">
        <div className="bg-white/95 backdrop-blur-2xl p-8 rounded-[45px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex items-center gap-8 max-w-2xl pointer-events-auto border-4 border-white/20">
          <AnimatePresence mode="wait">
            {activeObstacle ? (
              <motion.div 
                key={config.mode === 'jogging' && !isWaitingForObstacle ? 'jogging' : activeObstacle.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="flex items-center gap-8"
              >
                {config.mode === 'jogging' && !isWaitingForObstacle ? (
                  <>
                    <div className={`text-8xl bg-emerald-100 w-32 h-32 flex items-center justify-center rounded-[35px] shadow-inner border-b-8 border-emerald-200 transition-all duration-150 ${currentPulse ? 'scale-110 shadow-[0_0_20px_rgba(16,185,129,0.5)] bg-emerald-200' : ''}`}>
                      🏃
                    </div>
                    <div className="text-left relative">
                      <h3 className="text-5xl font-black text-emerald-600 drop-shadow-sm mb-2">
                        超慢跑中...
                      </h3>
                      <div className="flex items-center gap-4">
                        <p className="text-slate-600 text-2xl font-bold">原地擺動雙膝、輕快踏步</p>
                        {config.bpm && (
                          <div className={`px-4 py-1 bg-emerald-100 rounded-full text-emerald-700 font-black text-sm flex items-center gap-2 border border-emerald-200 transition-all duration-150 ${currentPulse ? 'scale-110' : ''}`}>
                             <span className="animate-pulse">🎵</span> {config.bpm} BPM
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-8xl bg-slate-100 w-32 h-32 flex items-center justify-center rounded-[35px] shadow-inner border-b-8 border-slate-200">
                      {getObstacleData(activeObstacle.type).icon}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-3">
                        <h3 className={`text-5xl font-black ${getObstacleData(activeObstacle.type).color} drop-shadow-sm mb-2`}>
                          {getObstacleData(activeObstacle.type).label}
                        </h3>
                        {config.mode === 'jogging' && (
                          <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-black animate-pulse">
                            ⚠️ 障礙出現
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 text-2xl font-bold mb-2">{getObstacleData(activeObstacle.type).action}</p>
                      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm font-bold">
                        <span>📹</span>
                        <span>請在鏡頭前完成動作，AI 將自動辨識通關</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="flex items-center gap-6 py-4">
                <span className="text-6xl animate-bounce">🏁</span>
                <div className="text-left">
                  <h3 className="text-4xl font-black text-slate-800">測驗完成！</h3>
                  <p className="text-slate-500 text-xl font-bold">正在計算最終得分...</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="fixed bottom-12 right-12 z-50">
          <button 
            onClick={onCancel}
            className="px-10 py-6 bg-red-600 border-b-8 border-red-900 text-white text-3xl font-black rounded-3xl shadow-2xl hover:bg-red-700 active:scale-95 transition pointer-events-auto"
          >
            結束中斷
          </button>
        </div>
      </div>

      {/* Combo Effect */}
      <AnimatePresence>
        {showComboEffect && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="text-[120px] font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.9)] italic tracking-tighter">
              {combo >= 10 ? 'ULTRA!!!' : combo >= 5 ? 'GREAT!!!' : 'NICE!!!'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full h-full bg-black overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover camera-mirror" autoPlay muted playsInline />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full object-cover z-10" 
          width={settings.layout === 'landscape' ? 1280 : 720} 
          height={settings.layout === 'landscape' ? 720 : 1280} 
        />
        
        {showResult && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[40px] p-12 max-w-2xl w-full text-center shadow-2xl border-8 border-blue-600"
            >
              <h2 className="text-6xl font-black text-slate-900 mb-8">障礙挑戰成果</h2>
              
              <div className="grid grid-cols-2 gap-8 mb-12">
                <div className="p-8 bg-blue-50 rounded-[30px] border-4 border-blue-200">
                  <p className="text-2xl font-bold text-blue-800 mb-2">最高連擊</p>
                  <p className="text-7xl font-black text-blue-600">{combo}</p>
                </div>
                <div className="p-8 bg-orange-50 rounded-[30px] border-4 border-orange-200">
                  <p className="text-2xl font-bold text-orange-800 mb-2">通過關卡</p>
                  <p className="text-7xl font-black text-orange-600">{currentIndex}</p>
                </div>
              </div>

              <div className="p-8 bg-slate-50 rounded-[30px] border-2 border-slate-200 mb-12">
                <p className="text-2xl font-bold text-slate-600 mb-6 text-center">動作統計分析</p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(actionStats).map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getObstacleData(type as ObstacleType).icon}</span>
                        <span className="font-bold text-slate-700">{getObstacleData(type as ObstacleType).label}</span>
                      </div>
                      <span className="text-3xl font-black text-blue-600">{count} <span className="text-sm">次</span></span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50 rounded-[30px] border-2 border-slate-200 mb-12">
                <p className="text-2xl font-bold text-slate-600 mb-4 uppercase tracking-wider">整體評價</p>
                <div className="flex justify-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`text-6xl ${i < Math.min(combo / 2 + 1, 5) ? 'grayscale-0' : 'grayscale'}`}>⭐</span>
                  ))}
                </div>
                <p className="text-3xl font-black text-slate-800 mt-6">
                  {combo >= 15 ? "大師級！身手超凡！" : combo >= 10 ? "卓越！反應極佳！" : combo >= 5 ? "優秀！動作到位！" : "繼續加油，越來越好！"}
                </p>
              </div>

              <button 
                onClick={() => onComplete(combo, { stats: actionStats, currentIndex })}
                className="w-full py-8 bg-slate-900 text-white rounded-[25px] text-4xl font-black hover:bg-slate-800 active:scale-95 transition shadow-2xl"
              >
                領取獎勵並返回
              </button>
            </motion.div>
          </div>
        )}

        {(isInitializing || cameraError) && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-md p-10 pointer-events-auto">
            <div className="text-center space-y-6 max-w-lg">
              {cameraError ? (
                <>
                  <div className="text-8xl">⚠️</div>
                  <p className="text-2xl font-black text-white">{cameraError}</p>
                  <p className="text-slate-300 text-base">本系統所有遊戲均由 AI 鏡頭視覺辨識進行動作偵測，請確認鏡頭連接正常且允許存取。</p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xl active:scale-95 transition shadow-lg"
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
                  <div className="w-20 h-20 border-8 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-3xl font-black text-white italic">AI 視覺感應器啟動中...</p>
                  <p className="text-slate-400 text-sm">請站在鏡頭視野正前方準備動作</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ProgressBar */}
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-white/5 z-20">
        <div 
          className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.6)]"
          style={{ width: `${(config.mode === 'jogging' ? jogProgress : (currentIndex / config.count) * 100)}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ObstacleRaceView;
