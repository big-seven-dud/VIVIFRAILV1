import { UserSettings } from '../types';
import React, { useEffect, useRef, useState } from 'react';
import { getPoseInstance, getCameraClass } from '../lib/PoseService';

interface Props {
  settings: UserSettings;
  onNext: () => void;
  onBack: () => void;
  speak: (t: string) => void;
}

const PositioningView: React.FC<Props> = ({ settings, onNext, onBack, speak }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStable, setIsStable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const poseRef = useRef<any>(null);
  
  // EMA Smoothing and Stability Tracking
  const smoothedLandmarks = useRef<any[] | null>(null);
  const anchorNosePos = useRef<{ x: number, y: number } | null>(null);
  const visibilityHistory = useRef<number[]>([]); // Window for ankle visibility
  const isTransitioning = useRef(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    speak("請向後退到看見全身。看到點點後請保持不動，系統將自動開始。只要您的頭部在圈圈內保持穩定即可。");
  }, [speak]);

    useEffect(() => {
    let camera: any;

    const initAll = () => {
      const pose = getPoseInstance();
      const CameraClass = getCameraClass();
      
      if (pose && CameraClass && videoRef.current && !cameraRef.current) {
        poseRef.current = pose;
        pose.onResults((res: any) => {
          if (!res.poseLandmarks) {
            setIsStable(false);
            setProgress(0);
            smoothedLandmarks.current = null;
            return;
          }

          const rawLandmarks = res.poseLandmarks;
          
          if (!smoothedLandmarks.current) {
            smoothedLandmarks.current = JSON.parse(JSON.stringify(rawLandmarks));
          } else {
            smoothedLandmarks.current.forEach((p, i) => {
              p.x = (p.x * 0.8) + (rawLandmarks[i].x * 0.2);
              p.y = (p.y * 0.8) + (rawLandmarks[i].y * 0.2);
              p.visibility = (p.visibility * 0.8) + (rawLandmarks[i].visibility * 0.2);
            });
          }

          const landmarks = smoothedLandmarks.current;
          const nose = landmarks[0];
          const lAnkle = landmarks[31];
          const rAnkle = landmarks[32];

          const avgVisibility = (lAnkle.visibility + rAnkle.visibility) / 2;
          visibilityHistory.current.push(avgVisibility);
          if (visibilityHistory.current.length > 10) visibilityHistory.current.shift();
          const windowAvgVis = visibilityHistory.current.reduce((a, b) => a + b, 0) / visibilityHistory.current.length;
          
          const isFullBodyVisible = windowAvgVis > 0.55;

          let moving = false;
          if (!anchorNosePos.current || !isFullBodyVisible) {
            anchorNosePos.current = { x: nose.x, y: nose.y };
          } else {
            const dist = Math.sqrt(
              Math.pow(nose.x - anchorNosePos.current.x, 2) + 
              Math.pow(nose.y - anchorNosePos.current.y, 2)
            );
            
            if (dist > 0.005) {
              if (dist > 0.03) {
                moving = true;
                anchorNosePos.current = { x: nose.x, y: nose.y }; 
              }
            }
          }

          if (isFullBodyVisible && !moving) {
            setIsStable(true);
          } else {
            setIsStable(false);
            setProgress(0);
          }

          drawVisuals(landmarks, isFullBodyVisible && !moving);
        });

        const camera = new CameraClass(videoRef.current, {
          onFrame: async () => {
            if (poseRef.current && videoRef.current && videoRef.current.readyState >= 2) {
              try {
                await poseRef.current.send({ image: videoRef.current! });
              } catch (e) {}
            }
          },
          width: settings.layout === 'landscape' ? 640 : 480,
          height: settings.layout === 'landscape' ? 480 : 640
        });
        cameraRef.current = camera;
        camera.start();
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
      if (retryInterval) clearInterval(retryInterval);
      if (cameraRef.current) {
         cameraRef.current.stop();
         cameraRef.current = null;
      }
    };
  }, []);

  // Progress logic
  useEffect(() => {
    if (progress >= 100 && !isTransitioning.current) {
      isTransitioning.current = true;
      onNext();
    }
  }, [progress, onNext]);

  useEffect(() => {
    if (isStable && !isTransitioning.current) {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            return 100;
          }
          return p + 5;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isStable]);

  const drawVisuals = (landmarks: any[], stable: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nose = landmarks[0];
    
    // 4. 視覺反饋：繪製鼻頭穩定範圍 (Tolerance Zone)
    if (anchorNosePos.current) {
      ctx.beginPath();
      ctx.arc((1 - anchorNosePos.current.x) * canvas.width, anchorNosePos.current.y * canvas.height, 20, 0, Math.PI * 2);
      ctx.strokeStyle = stable ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)";
      ctx.lineWidth = 4;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 繪製關鍵點
    ctx.fillStyle = stable ? "#10b981" : "#ef4444";
    ctx.shadowBlur = 8;
    ctx.shadowColor = stable ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)";
    landmarks.forEach((p, i) => {
      // 顯示主要關節
      if (((i >= 11 && i <= 16) || (i >= 23 && i <= 32) || i === 0) && p.visibility > 0.4) {
        ctx.beginPath();
        ctx.arc((1 - p.x) * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  return (
    <div className="flex flex-col space-y-6 flex-grow pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">全自動定位</h2>
          <p className="text-xl text-slate-500 font-bold">請退後到看見全身，並將頭部保持在虛線圈內</p>
        </div>
        {progress > 0 && (
          <div className="px-6 py-2 bg-green-100 text-green-700 rounded-full font-black text-xl animate-pulse border-2 border-green-200">
            啟動中: {progress}%
          </div>
        )}
      </div>

      <div className={`relative ${settings.layout === 'portrait' ? 'aspect-[3/4] max-w-sm mx-auto' : 'aspect-video'} bg-slate-900 rounded-[50px] overflow-hidden shadow-2xl ring-8 ring-white border-4 border-slate-200`}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover camera-mirror" autoPlay muted playsInline />
        <canvas ref={canvasRef} width={settings.layout === 'landscape' ? 640 : 480} height={settings.layout === 'landscape' ? 480 : 640} className="absolute inset-0 w-full h-full object-cover z-10" />
        
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
          {!isStable ? (
            <div className="bg-black/60 backdrop-blur-md p-10 rounded-[40px] text-white text-center border-4 border-white/20">
              <p className="text-4xl font-black mb-2">請對準並保持不動</p>
              <p className="text-xl opacity-80">確保雙腳清晰可見</p>
            </div>
          ) : (
            <div className="bg-green-600/90 px-12 py-8 rounded-[40px] text-white text-center shadow-2xl border-4 border-white">
              <p className="text-3xl font-black">偵測穩定</p>
              <p className="text-xl font-bold opacity-90">請維持姿勢...</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        <button onClick={onBack} className="py-6 bg-slate-200 text-slate-600 text-2xl font-black rounded-[40px] border-b-8 border-slate-300 active:scale-95 transition">返回</button>
        <div className="bg-blue-50 border-4 border-blue-100 p-6 rounded-[40px] flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl">💡</div>
          <p className="text-blue-700 font-bold leading-tight">穩定小訣竅：<br/>看著螢幕裡的圓圈，讓鼻子留在圈圈內。</p>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 text-red-700 p-8 rounded-[30px] border-4 border-red-300 font-bold text-2xl">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default PositioningView;
