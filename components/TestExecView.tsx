
import { UserSettings } from '../types';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { getPoseInstance, getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  mode: 'duration' | 'stopwatch' | 'counter' | 'tug';
  targetSeconds?: number;
  targetCount?: number;
  label?: string;
  onComplete: (value: number, details?: any) => void;
  onCancel: () => void;
  speak: (t: string) => void;
}

const TestExecView: React.FC<Props> = ({ settings, mode, targetSeconds, targetCount, label, onComplete, onCancel, speak }) => {
  const [active, setActive] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [detected, setDetected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const elapsedRef = useRef(0);
  const detectedRef = useRef(false);

  const [repsData, setRepsData] = useState<{id: number, duration: number, timestamp: number}[]>([]);
  const repsRef = useRef<{id: number, duration: number, timestamp: number}[]>([]);
  const tugStartTime = useRef<number | null>(null);
  const tugFinished = useRef(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const startTime = useRef<number>(0);
  const isStarted = useRef(false);
  const isCompletedRef = useRef(false);

  const triggerComplete = (value: number, details?: any) => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;
    propsRef.current.onComplete(value, details);
  };
  
  // Logic Refs
  const lastState = useRef<'sitting' | 'standing'>('sitting');
  const initialAnklesX = useRef<number[]>([]);
  const lastCountTime = useRef<number>(0);
  const gestureStartTime = useRef<number | null>(null);
  const lockedPersonX = useRef<number | null>(null);
  const lastValidLandmarks = useRef<any[] | null>(null);
  const shoulderBaselineY = useRef<number | null>(null);

  // New robust tracking states & refs
  const [walkMode, setWalkMode] = useState<'forward' | 'backward'>(() => {
    try {
      const stored = localStorage.getItem('vivifrail_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.walkMode) return parsed.walkMode;
      }
    } catch {
      // Ignore
    }
    return 'forward';
  });

  const handleWalkModeChange = (newMode: 'forward' | 'backward') => {
    setWalkMode(newMode);
    try {
      const stored = localStorage.getItem('vivifrail_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.walkMode = newMode;
        localStorage.setItem('vivifrail_settings', JSON.stringify(parsed));
      }
    } catch {
      // Ignore
    }
  };

  const isWalkingStarted = useRef(false);
  const initialShoulderWidth = useRef<number | null>(null);
  const shoulderWidthFrames = useRef<number[]>([]);
  const backwardFallbackTimer = useRef<any>(null);
  const sitSustainedStart = useRef<number | null>(null);
  const initialTugShoulderWidth = useRef<number | null>(null);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const propsRef = useRef({ mode, targetSeconds, targetCount, onComplete, speak });
  useEffect(() => { 
    propsRef.current = { mode, targetSeconds, targetCount, onComplete, speak }; 
  }, [mode, targetSeconds, targetCount, onComplete, speak]);

    const cameraRefLocal = useRef<any>(null);

    useEffect(() => {
    let isMounted = true;

    const onResults = (res: any) => {
      if (!isMounted) return;
      let landmarks = res.poseLandmarks;
      
      // --- Subject Binding Logic ---
      if (landmarks) {
        const currentX = landmarks[0].x; 
        if (lockedPersonX.current === null) {
          lockedPersonX.current = currentX;
          lastValidLandmarks.current = landmarks;
        } else {
          const dist = Math.abs(currentX - lockedPersonX.current);
          if (activeRef.current) {
            if (dist > 0.4) {
              landmarks = lastValidLandmarks.current;
            } else {
              lockedPersonX.current = currentX;
              lastValidLandmarks.current = landmarks;
            }
          } else {
            lockedPersonX.current = currentX;
            lastValidLandmarks.current = landmarks;
          }
        }
      }

      detectedRef.current = !!landmarks;
      setDetected(!!landmarks);
      
      if (landmarks) {
        const lWrist = landmarks[15], rWrist = landmarks[16];
        const lShoulder = landmarks[11], rShoulder = landmarks[12];
        const isHandsUp = lWrist.y < lShoulder.y - 0.1 && rWrist.y < rShoulder.y - 0.1;
        
        if (isHandsUp) { 
          if (!gestureStartTime.current) gestureStartTime.current = Date.now();
          if (Date.now() - gestureStartTime.current > 1500) {
            propsRef.current.speak("已跳過此項測試。");
            triggerComplete(0);
            return;
          }
        } else {
          gestureStartTime.current = null;
        }

        // Always draw skeleton for feedback, even if not active yet
        drawSkeleton(landmarks);
        
        if (activeRef.current) {
          processAI(landmarks);
        }
      } else {
        gestureStartTime.current = null;
        // Clear skeleton if no one detected
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
           ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };

    const initAll = () => {
      const pose = getPoseInstance();
      const CameraClass = getCameraClass();
      
      if (pose && CameraClass && videoRef.current && !cameraRefLocal.current) {
        pose.onResults(onResults);
        poseRef.current = pose;
        
        const camera = new CameraClass(videoRef.current, { 
          onFrame: async () => {
            if (!isMounted) return;
            if (videoRef.current && poseRef.current && videoRef.current.readyState >= 2) {
              try {
                await poseRef.current.send({ image: videoRef.current });
              } catch (e) {
                // Ignore transient errors
              }
            }
          },
          width: settings.layout === 'landscape' ? 640 : 480, 
          height: settings.layout === 'landscape' ? 480 : 640 
        });
        
        cameraRefLocal.current = camera;
        camera.start()
          .then(() => {
            if (isMounted) setIsInitializing(false);
          })
          .catch((err: any) => {
            console.error("Camera start error:", err);
            if (isMounted) {
              setCameraError("無法開啟相機，請確認權限設定。");
              setIsInitializing(false);
            }
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
      if (cameraRefLocal.current) {
         cameraRefLocal.current.stop();
         cameraRefLocal.current = null;
      }
      if (backwardFallbackTimer.current) {
         clearTimeout(backwardFallbackTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    // We handle mode completion within processAI or manual buttons
  }, [count, mode, targetCount, active, onComplete]);

  const startTest = () => {
    if (active) return;
    setCountdown(0);
    setActive(true);
    isCompletedRef.current = false;
    
    // Reset detection states
    lastState.current = 'sitting';
    lastCountTime.current = 0;
    tugStartTime.current = null;
    tugFinished.current = false;
    shoulderBaselineY.current = null;
    initialAnklesX.current = [];
    setCount(0);
    repsRef.current = [];
    setRepsData([]);

    // Reset walk direction states
    isWalkingStarted.current = false;
    initialShoulderWidth.current = null;
    shoulderWidthFrames.current = [];
    sitSustainedStart.current = null;
    initialTugShoulderWidth.current = null;
    
    startTime.current = Date.now();
    
    if (mode === 'stopwatch' && walkMode === 'backward') {
      speak("系統已就位。請站在相機前方，起步往後走時將自動計時。");
      if (backwardFallbackTimer.current) clearTimeout(backwardFallbackTimer.current);
      backwardFallbackTimer.current = setTimeout(() => {
        if (activeRef.current && !isWalkingStarted.current) {
          isWalkingStarted.current = true;
          startTime.current = Date.now();
          speak("系統自動啟動計時！");
        }
      }, 4000); // 4 seconds fallback
    } else {
      speak("請開始！");
    }
  };

  const processAI = (landmarks: any[]) => {
    const now = Date.now();
    const { mode, targetCount, speak } = propsRef.current;

    if (mode === 'duration') {
      const lAnkle = landmarks[31], rAnkle = landmarks[32];
      const ankles = [lAnkle.x, rAnkle.x];
      
      if (initialAnklesX.current.length === 0) {
        initialAnklesX.current = ankles;
      } else {
        const hasMovedSignificantly = ankles.some((x, i) => Math.abs(x - initialAnklesX.current[i]) > 0.15);
        if (hasMovedSignificantly) {
          const duration = elapsedRef.current > 0 ? elapsedRef.current : Math.max(0, (Date.now() - startTime.current) / 1000);
          speak("偵測到腳步移動，平衡測試結束。");
          triggerComplete(duration);
          return;
        }
      }
    }

    const calculateAngle = (a: any, b: any, c: any) => {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      if (angle > 180.0) angle = 360 - angle;
      return angle;
    };

    if (mode === 'counter') {
      const lShoulder = landmarks[11], rShoulder = landmarks[12];
      const shoulder = lShoulder.visibility > rShoulder.visibility ? lShoulder : rShoulder;
      
      if (shoulderBaselineY.current === null || (shoulder.visibility > 0.5 && shoulder.y > shoulderBaselineY.current)) {
          shoulderBaselineY.current = shoulder.y;
      }
      
      const currentY = shoulder.y;
      const baselineY = shoulderBaselineY.current || 0.8;
      const displacement = baselineY - currentY;

      // Standing: Shoulder moves up significantly
      if (displacement > 0.08 && lastState.current === 'sitting' && (now - lastCountTime.current > 400)) {
        lastState.current = 'standing';
        const lastT = lastCountTime.current || startTime.current;
        lastCountTime.current = now;
        
        setCount(c => {
          const next = c + 1;
          const repDuration = (Date.now() - lastT) / 1000;
          const repInfo = { id: next, duration: repDuration, timestamp: Date.now() };
          
          repsRef.current.push(repInfo);
          setRepsData([...repsRef.current]);
          propsRef.current.speak(String(next));
          
          // Finish on 5th stand
          if (next >= 5) {
            const totalDuration = (Date.now() - startTime.current) / 1000;
            triggerComplete(totalDuration, [...repsRef.current]);
          }
          return next;
        });
      } 
      // Sitting: Shoulder moves back down
      else if (displacement < 0.04 && lastState.current === 'standing' && (now - lastCountTime.current > 400)) {
        lastState.current = 'sitting';
      }
    }

    if (mode === 'tug') {
      const lShoulder = landmarks[11], rShoulder = landmarks[12];
      const shoulder = lShoulder.visibility > rShoulder.visibility ? lShoulder : rShoulder;
      const sWidth = Math.abs(lShoulder.x - rShoulder.x);
      
      // Only calibrate baseline sitting height and core width BEFORE the TUG test starts (sitting on the chair far away)
      if (!tugStartTime.current && sWidth > 0 && lShoulder.visibility > 0.5 && rShoulder.visibility > 0.5) {
        if (shoulderBaselineY.current === null || shoulder.y > shoulderBaselineY.current) {
          shoulderBaselineY.current = shoulder.y;
        }
        if (initialTugShoulderWidth.current === null || sWidth < initialTugShoulderWidth.current) {
          initialTugShoulderWidth.current = sWidth;
        }
      }
      
      const currentY = shoulder.y;
      const baselineY = shoulderBaselineY.current || 0.8;
      const displacement = baselineY - currentY;

      // 1. Detect 起立
      if (displacement > 0.08 && lastState.current === 'sitting') {
        lastState.current = 'standing';
        if (!tugStartTime.current) {
          tugStartTime.current = now;
          propsRef.current.speak("計時開始，請起身向前走！");
        }
        sitSustainedStart.current = null;
      }

      if (displacement > 0.08) {
        lastState.current = 'standing';
      }

      // 2. Detect 坐下：需要有足夠的測驗運行時間（3.5秒），且人的肩膀寬度 sWidth 需接近起點寬度（表示人已經折返，走回並靠近椅子的起始位置）
      // 這能完全消除人在向前走靠近相機或折返過程中，因高度比例或鏡頭俯仰角導致的「坐下」誤判
      const returnedToChair = initialTugShoulderWidth.current
        ? sWidth <= initialTugShoulderWidth.current * 1.45
        : sWidth <= 0.18;

      if (displacement < 0.05 && returnedToChair && lastState.current === 'standing' && tugStartTime.current && !tugFinished.current) {
        if (now - tugStartTime.current > 3500) {
          if (sitSustainedStart.current === null) {
            sitSustainedStart.current = now;
          } else if (now - sitSustainedStart.current > 600) {
            tugFinished.current = true;
            // 計算時使用最初「偵測到坐下」的時間，扣除穩定驗證緩衝，避免多計！
            const tugDuration = (sitSustainedStart.current - tugStartTime.current) / 1000;
            propsRef.current.speak("偵測到坐下，測試完成！");
            triggerComplete(tugDuration);
          }
        }
      } else {
        sitSustainedStart.current = null;
      }
    }

    if (mode === 'stopwatch') {
      const lAnkle = landmarks[31], rAnkle = landmarks[32];
      const lShoulder = landmarks[11], rShoulder = landmarks[12];
      const lWrist = landmarks[15], rWrist = landmarks[16];
      
      const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
      const handRaised = (lWrist.visibility > 0.6 && lWrist.y < lShoulder.y - 0.2) || 
                         (rWrist.visibility > 0.6 && rWrist.y < rShoulder.y - 0.2);

      if (activeRef.current) {
        if (walkMode === 'backward') {
          // Automatic Starting of backward walking stopwatch
          if (!isWalkingStarted.current) {
            if (shoulderWidth > 0.05) {
              if (shoulderWidthFrames.current.length < 15) {
                shoulderWidthFrames.current.push(shoulderWidth);
                if (shoulderWidthFrames.current.length === 15) {
                  const avg = shoulderWidthFrames.current.reduce((a, b) => a + b, 0) / 15;
                  initialShoulderWidth.current = avg;
                  propsRef.current.speak("準備就緒。起步往後走時將自動啟動計時。");
                }
              } else if (initialShoulderWidth.current !== null) {
                if (shoulderWidth < initialShoulderWidth.current - 0.02) {
                  isWalkingStarted.current = true;
                  startTime.current = Date.now();
                  propsRef.current.speak("偵測到起步，倒數計時開始！");
                }
              }
            }
            return;
          }

          // Stop ONLY on explicit raising of hand at the designated spot or manual trigger
          if (handRaised && (now - startTime.current > 1500)) {
            const finalTime = (now - startTime.current) / 1000;
            propsRef.current.speak("偵測到停止標記，測試完成。");
            triggerComplete(finalTime);
            return;
          }
        } else {
          // Forward Walking: ONLY stop on explicit gestures (handRaised / button / Spacebar)
          if (handRaised && (now - startTime.current > 1500)) {
            const finalTime = (now - startTime.current) / 1000;
            propsRef.current.speak("偵測到停止標記，測試完成。");
            triggerComplete(finalTime);
            return;
          }
        }
      }
    }
  };

  const drawSkeleton = (l: any[]) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    const { width, height } = canvasRef.current;
    ctx.clearRect(0, 0, width, height);
    
    if (gestureStartTime.current) {
      const progress = Math.min((Date.now() - gestureStartTime.current) / 1500, 1);
      ctx.strokeStyle = "#ef4444"; 
      ctx.lineWidth = 20;
      ctx.beginPath(); 
      ctx.arc(width/2, height/2, 120, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress)); 
      ctx.stroke();
      
      ctx.fillStyle = "#ef4444"; 
      ctx.font = "bold 48px Noto Sans TC"; 
      ctx.textAlign = "center";
      ctx.fillText("跳過中...", width/2, height/2 + 15);
    }

    ctx.strokeStyle = '#10b981'; 
    ctx.lineWidth = 12; 
    ctx.lineCap = 'round';
    
    // Connect points: shoulders to hips, hips to knees, knees to ankles
    [[11,12],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28]].forEach(([i,j]) => {
      if (l[i] && l[j] && l[i].visibility > 0.4 && l[j].visibility > 0.4) {
        ctx.beginPath(); 
        ctx.moveTo((1 - l[i].x) * width, l[i].y * height);
        ctx.lineTo((1 - l[j].x) * width, l[j].y * height); 
        ctx.stroke();
      }
    });

    [11, 12, 23, 24, 25, 26, 27, 28].forEach(i => {
      if (l[i] && l[i].visibility > 0.4) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc((1 - l[i].x) * width, l[i].y * height, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeRef.current && propsRef.current.mode === 'stopwatch') {
        e.preventDefault();
        triggerComplete(elapsedRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let t: any;
    if (detected && !active && countdown > 0) {
      const waitTime = mode === 'stopwatch' ? 500 : 1000;
      t = setTimeout(() => {
        setCountdown(c => c - 1);
        if (countdown === 1) { 
          if (mode === 'stopwatch' && walkMode === 'backward') {
            speak("請隨時起步往後走！系統將自動偵測。");
          } else {
            speak("請開始！");
          }
          setActive(true); 
          startTime.current = Date.now(); 

          if (mode === 'stopwatch' && walkMode === 'backward') {
            if (backwardFallbackTimer.current) clearTimeout(backwardFallbackTimer.current);
            backwardFallbackTimer.current = setTimeout(() => {
              if (activeRef.current && !isWalkingStarted.current) {
                isWalkingStarted.current = true;
                startTime.current = Date.now();
                speak("系統自動啟動計時！");
              }
            }, 4000);
          }
        }
      }, waitTime);
    } else if (active) {
      t = setInterval(() => {
        const time = (Date.now() - startTime.current) / 1000;
        elapsedRef.current = time;
        setElapsed(time);
        if (propsRef.current.mode === 'duration' && time >= (propsRef.current.targetSeconds || 10)) {
          triggerComplete(propsRef.current.targetSeconds || 10);
        }
      }, 100);
    }
    return () => { clearInterval(t); clearTimeout(t); };
  }, [detected, active, countdown, walkMode]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-grow overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover camera-mirror" autoPlay muted playsInline />
        <canvas ref={canvasRef} width={settings.layout === 'landscape' ? 640 : 480} height={settings.layout === 'landscape' ? 480 : 640} className="absolute inset-0 w-full h-full object-cover z-10" />
        
        {(isInitializing || cameraError) && (
          <div className="absolute inset-0 z-40 bg-slate-900 flex flex-col items-center justify-center text-white space-y-6">
            {cameraError ? (
              <>
                <div className="text-8xl">⚠️</div>
                <p className="text-3xl font-black">{cameraError}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xl active:scale-95 transition"
                >
                  重新整理
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 border-8 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-3xl font-black italic">相機模組啟動中...</p>
              </>
            )}
          </div>
        )}
        
        <div className="absolute inset-0 pointer-events-none z-20 p-8">
          {/* Status Indicator - Top Left */}
          <div className="absolute top-8 left-8 bg-white/95 backdrop-blur-xl px-8 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-4 border-blue-600 z-30">
            <div className={`w-6 h-6 rounded-full ${detected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-2xl font-black text-slate-800">
              {active ? (
                mode === 'stopwatch' ? (
                  walkMode === 'backward' ? (
                    isWalkingStarted.current ? "🚶‍♀️ 往後走計時中（請至定點舉手停止）" : "⏱️ 往後走準備：起步後將自動計時"
                  ) : "🚶‍♂️ 往前走計時中（抵達按空白鍵或螢幕按鈕停止）"
                ) : (mode === 'tug' ? "TUG 測試：請起立走 3 米並坐下" : "檢測進行中")
              ) : "倒數準備"}
            </span>
          </div>

          {/* Chair Stand Visualizer */}
          {active && (mode === 'counter' || mode === 'tug') && (
            <motion.div 
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="absolute top-32 left-8 bg-white/90 backdrop-blur-xl p-6 rounded-[30px] border-4 border-blue-500 shadow-2xl flex flex-col items-center gap-4 z-30"
            >
              <div className="relative w-24 h-32 flex flex-col items-center justify-end">
                {/* Chair */}
                <div className="absolute bottom-0 w-16 h-10 border-t-8 border-x-8 border-slate-400 rounded-t-md" />
                {/* Person */}
                <motion.div 
                  animate={{ 
                    y: lastState.current === 'standing' ? -40 : 0,
                    scaleY: lastState.current === 'standing' ? 1 : 0.6,
                    originY: 1
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-10 bg-blue-600 rounded-full relative"
                  style={{ height: '60px' }}
                >
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-sm" />
                </motion.div>
              </div>
              <div className="text-center">
                <span className={`text-2xl font-black ${lastState.current === 'standing' ? 'text-green-600' : 'text-orange-600'}`}>
                  {lastState.current === 'standing' ? '站立中' : '坐下中'}
                </span>
                {mode === 'tug' && tugStartTime.current && (
                  <div className="text-blue-600 font-bold mt-2 animate-pulse">TUG 計時中</div>
                )}
              </div>
            </motion.div>
          )}

          {/* Countdown - Center (Temporary) */}
          {!active && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-12">
              {detected && countdown > 0 ? (
                <div className="bg-blue-600/90 text-white rounded-full w-64 h-64 flex items-center justify-center shadow-2xl border-[12px] border-white text-[120px] font-black animate-pulse">
                  {countdown}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-8">
                  {mode === 'stopwatch' && (
                    <div className="bg-white/95 backdrop-blur-md p-6 rounded-[30px] border-4 border-blue-600 shadow-2xl pointer-events-auto flex flex-col items-center gap-4 max-w-lg mb-4">
                      <p className="font-sans font-black text-slate-800 text-2xl">🚶 步行測驗方向設定</p>
                      <p className="text-sm font-bold text-slate-500">（請依照受試者的運動空間與習慣調整）</p>
                      <div className="flex gap-4 w-full">
                        <button
                          onClick={() => handleWalkModeChange('forward')}
                          className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-4 transition-all ${
                            walkMode === 'forward'
                              ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-lg scale-105'
                              : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                          }`}
                        >
                          <span className="text-3xl">🚶‍♂️ 往前走</span>
                          <span className="font-bold text-base">走向相機</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">手動按空白鍵/按鈕停止</span>
                        </button>
                        <button
                          onClick={() => handleWalkModeChange('backward')}
                          className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-4 transition-all ${
                            walkMode === 'backward'
                              ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-lg scale-105'
                              : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                          }`}
                        >
                          <span className="text-3xl">🚶‍♀️ 往後走</span>
                          <span className="font-bold text-base">遠離相機</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">自動起步計時，抵達舉手停止</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white/90 backdrop-blur-md p-8 rounded-[40px] border-4 border-blue-500 text-center max-w-md shadow-2xl">
                    <p className="text-3xl font-black text-slate-800 mb-2">請站在畫面中央</p>
                    <p className="text-xl font-bold text-slate-500">偵測到人體後將自動開始倒數</p>
                  </div>
                  <button 
                    onClick={startTest}
                    className="px-16 py-8 bg-blue-600 text-white text-4xl font-black rounded-[40px] pointer-events-auto shadow-2xl active:scale-95 border-b-[12px] border-blue-800 transform hover:scale-105 transition-all"
                  >
                    手動開始
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Timer/Counter - Top Right (Below Cancel Button) */}
          {active && (
            <div className="absolute top-32 right-8 flex flex-col items-end space-y-4 z-30">
              <div className="bg-white/95 backdrop-blur-xl rounded-[40px] px-10 py-6 shadow-2xl flex flex-col items-center border-4 border-blue-600">
                <span className="text-slate-500 font-bold text-xl mb-1">
                  {mode === 'counter' ? `完成次數：${count} / 5` : 
                   (mode === 'tug' ? "TUG 偵測時間" : (mode === 'stopwatch' ? "已步行時間" : "剩餘時間"))}
                </span>
                <span className="text-7xl font-black text-blue-700 leading-none">
                  {((mode === 'stopwatch' && walkMode === 'backward' && !isWalkingStarted.current) || (mode === 'tug' && !tugStartTime.current)) ? "0.0" :
                    (mode === 'tug' && tugStartTime.current ? (Date.now() - tugStartTime.current)/1000 : elapsed).toFixed(1)}
                  <span className="text-3xl ml-2">秒</span>
                </span>
              </div>
            </div>
          )}

          {/* Stop Gesture Hint */}
          {active && mode === 'stopwatch' && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-md px-8 py-3 rounded-full text-white font-black text-xl border-2 border-white/30 animate-bounce z-30 shadow-xl">
              {walkMode === 'backward' ? "達到終點時「舉手過頭」或按下方鈕停止" : "走完 4/6 米後按「空白鍵」或下方鈕停止"}
            </div>
          )}

          {/* Large Stop Button - Bottom Center (For Stopwatch) */}
          {active && mode === 'stopwatch' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-30">
              <button 
                onClick={() => triggerComplete(elapsed)}
                className="px-12 py-6 bg-red-600 text-white text-3xl font-black rounded-full pointer-events-auto shadow-2xl active:scale-95 border-b-8 border-red-900 transform hover:scale-105 transition-all text-center flex items-center justify-center gap-3"
              >
                <span>⏹️</span>
                停止測試
              </button>
              <p className="text-white/90 text-sm font-bold bg-black/50 px-4 py-1 rounded-full backdrop-blur-sm shadow-md">
                {walkMode === 'backward' ? "(也可至定點舉手或按此停止)" : "(也可按鍵盤「空白鍵」停止)"}
              </p>
            </div>
          )}

          {/* Skip Hint - Bottom Left */}
          <div className="absolute bottom-8 left-8 bg-black/60 backdrop-blur-md p-4 rounded-2xl text-white text-xl font-bold border-2 border-white/20 z-30">
            🙌 雙手舉過頭頂 1.5 秒可跳過此項
          </div>

          {/* Manual Skip Button - Bottom Right */}
          <button 
            onClick={() => {
              propsRef.current.speak("已跳過此項測試。");
              triggerComplete(0);
            }}
            className="absolute bottom-8 right-8 bg-slate-700/80 hover:bg-slate-800 text-white px-12 py-6 rounded-[30px] font-black text-2xl z-50 shadow-2xl border-b-8 border-slate-900 pointer-events-auto active:scale-95 flex items-center gap-3 transition-colors"
          >
            <span>⏭️</span>
            跳過此項
          </button>
        </div>
      </div>
      
      <button 
         onClick={onCancel} 
         className="absolute top-8 right-8 bg-red-600 text-white px-8 py-4 rounded-[25px] font-black text-xl z-50 shadow-2xl border-b-4 border-red-800 pointer-events-auto active:scale-95"
      >
        放棄測驗
      </button>
    </div>
  );
};

export default TestExecView;
