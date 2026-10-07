
import React, { useState, useEffect } from 'react';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  userId?: string;
  onStart: (config: { level: 'A' | 'B' | 'C' | 'D', count: number, mode: 'normal' | 'jogging', time?: number, bpm?: number }) => void;
  onBack: () => void;
}

const ObstacleConfigView: React.FC<Props> = ({ userId, onStart, onBack }) => {
  const [level, setLevel] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<'normal' | 'jogging'>('normal');
  const [jogTime, setJogTime] = useState(30);
  const [bpm, setBpm] = useState(100);

  const levels = [
    { 
      id: 'A', 
      label: 'A 級 (失能者)', 
      walkDesc: '目標 5 組，每組 10 步 (總計 50 步)', 
      sitStandDesc: '目標 3 組，每組 12 次 (系統提示：需有人輔助)', 
      stretchDesc: '包含於輔助肢體運動',
      defaultCount: 8, 
      defaultMode: 'normal' 
    },
    { 
      id: 'B', 
      label: 'B / B+ 級 (衰弱者)', 
      walkDesc: '目標 5 組，每組 100 步 (總計 500 步)', 
      sitStandDesc: '目標 3 組，每組 12 次 (系統提示：模擬坐下動作)', 
      stretchDesc: '【條件觸發】若為 B+ 級才派案，目標 3 組，每組 3 次',
      defaultCount: 10, 
      defaultMode: 'normal' 
    },
    { 
      id: 'C', 
      label: 'C / C+ 級 (衰弱前期者)', 
      walkDesc: '目標 3 組，每組 300 步 (總計 900 步)', 
      sitStandDesc: '目標 3 組，每組 12 次 (系統提示：自主起身)', 
      stretchDesc: '目標 3 組，每組 3 次',
      defaultCount: 12, 
      defaultMode: 'jogging', 
      defaultJogTime: 60, 
      defaultBPM: 100 
    },
    { 
      id: 'D', 
      label: 'D 級 (健康者)', 
      walkDesc: '目標 2 組，每組 500 步 (總計 1000 步)', 
      sitStandDesc: '目標 3 組，每組 12 次 (系統提示：自主起身)', 
      stretchDesc: '目標 3 組，每組 3 次',
      defaultCount: 15, 
      defaultMode: 'jogging', 
      defaultJogTime: 90, 
      defaultBPM: 120 
    }
  ];

  useEffect(() => {
    const userDefaultLevel = LocalDbService.getDefaultUserLevel(userId || '');
    handleLevelChange(userDefaultLevel);
  }, [userId]);

  const handleLevelChange = (newLevel: 'A' | 'B' | 'C' | 'D') => {
    setLevel(newLevel);
    const config = levels.find(l => l.id === newLevel);
    if (config) {
      setCount(config.defaultCount);
      if (config.defaultMode) setMode(config.defaultMode as any);
      if (config.defaultJogTime) setJogTime(config.defaultJogTime);
      if (config.defaultBPM) setBpm(config.defaultBPM);
    }
  };

  const selectedLevel = levels.find(l => l.id === level);

  // If level changes to A or B, force mode to normal
  React.useEffect(() => {
    if ((level === 'A' || level === 'B') && mode === 'jogging') {
      setMode('normal');
    }
    if (mode === 'jogging') {
      const config = levels.find(l => l.id === level);
      if (config?.defaultJogTime) setJogTime(config.defaultJogTime);
      if (config?.defaultBPM) setBpm(config.defaultBPM);
    }
  }, [level, mode]);

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">障礙賽跑設定</h2>
          <p className="text-xl text-slate-500 font-bold">自訂難度與關卡量</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg">返回</button>
      </div>

      <div className="bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-lg space-y-8">
        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">1. 選擇分級難度</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {levels.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLevelChange(l.id as any)}
                className={`p-6 rounded-[30px] border-4 text-left transition-all ${level === l.id ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-50 text-slate-600 border-slate-100'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{l.label}</span>
                  {level === l.id && <span className="text-2xl">✅</span>}
                </div>
              </button>
            ))}
          </div>
          {selectedLevel && (
            <div className="p-6 bg-blue-50 rounded-2xl border-2 border-blue-100 animate-in fade-in slide-in-from-top-2 space-y-3">
               <p className="text-blue-900 font-black text-xl flex items-center gap-2">
                 <span>💡</span> 每日運動處方難度與動作說明 ({selectedLevel.label})
               </p>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-lg font-bold">
                 <div className="bg-white p-4 rounded-2xl border border-blue-200 text-slate-800 shadow-sm">
                   <span className="block font-black text-blue-600 mb-1">🏃‍♂️ 原地走 / 超慢跑</span>
                   <span className="text-sm font-semibold text-slate-700">{selectedLevel.walkDesc}</span>
                 </div>
                 <div className="bg-white p-4 rounded-2xl border border-blue-200 text-slate-800 shadow-sm">
                   <span className="block font-black text-blue-600 mb-1">🧱 坐站 (蹲起/翻越)</span>
                   <span className="text-sm font-semibold text-slate-700">{selectedLevel.sitStandDesc}</span>
                 </div>
                 <div className="bg-white p-4 rounded-2xl border border-blue-200 text-slate-800 shadow-sm">
                   <span className="block font-black text-blue-600 mb-1">⭐ 向上伸展 (打擊)</span>
                   <span className="text-sm font-semibold text-slate-700">{selectedLevel.stretchDesc}</span>
                 </div>
               </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">2. 選擇遊戲模式</label>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setMode('normal')}
              className={`p-6 rounded-[30px] border-4 font-black text-xl transition-all ${mode === 'normal' ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg scale-95' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
            >
              標準障礙賽
            </button>
            <button 
              disabled={level === 'A' || level === 'B'}
              onClick={() => setMode('jogging')}
              className={`p-6 rounded-[30px] border-4 font-black text-xl transition-all ${mode === 'jogging' ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg scale-95' : (level === 'A' || level === 'B' ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed opacity-50' : 'bg-slate-50 text-slate-400 border-slate-100')}`}
            >
              🏃‍♂️ 超慢跑模式
              {(level === 'A' || level === 'B') && <span className="block text-xs font-bold mt-1 opacity-60">(限 C/D 級)</span>}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">3. 設定關卡障礙數量：<span className="text-blue-600">{count}</span> 個</label>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setCount(Math.max(3, count - 1))}
              className="w-20 h-20 bg-slate-100 rounded-2xl text-4xl font-black text-slate-500 shadow-inner flex items-center justify-center border-b-4 border-slate-200 active:scale-95 transition"
            >
              -
            </button>
            <div className="flex-grow h-6 bg-slate-100 rounded-full relative overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (count / 25) * 100)}%` }}
              ></div>
            </div>
            <button 
              onClick={() => setCount(Math.min(30, count + 1))}
              className="w-20 h-20 bg-slate-100 rounded-2xl text-4xl font-black text-slate-500 shadow-inner flex items-center justify-center border-b-4 border-slate-200 active:scale-95 transition"
            >
              +
            </button>
          </div>
          <p className="text-center text-slate-400 font-bold">可依個人體能自由增減障礙數量 (建議 5 ~ 20 個)</p>
        </div>

        {mode === 'jogging' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 animate-in fade-in slide-in-from-bottom-4">
             <div className="space-y-4 p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
                <label className="text-xl font-black text-emerald-800 flex justify-between">
                   <span>🏃 超慢跑時間</span>
                   <span className="text-emerald-600">{jogTime} 秒</span>
                </label>
                <div className="flex items-center gap-4">
                   <button onClick={() => setJogTime(Math.max(10, jogTime - 5))} className="w-12 h-12 bg-white rounded-xl shadow-sm font-black text-emerald-600">-</button>
                   <div className="flex-grow h-3 bg-emerald-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(jogTime / 120) * 100}%` }} />
                   </div>
                   <button onClick={() => setJogTime(Math.min(120, jogTime + 5))} className="w-12 h-12 bg-white rounded-xl shadow-sm font-black text-emerald-600">+</button>
                </div>
             </div>

             <div className="space-y-4 p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
                <label className="text-xl font-black text-emerald-800 flex justify-between">
                   <span>🎵 提示速度 (BPM)</span>
                   <span className="text-emerald-600">{bpm} BPM</span>
                </label>
                <div className="flex items-center gap-4">
                   <button onClick={() => setBpm(Math.max(60, bpm - 10))} className="w-12 h-12 bg-white rounded-xl shadow-sm font-black text-emerald-600">-</button>
                   <div className="flex-grow h-3 bg-emerald-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(bpm / 200) * 100}%` }} />
                   </div>
                   <button onClick={() => setBpm(Math.min(200, bpm + 10))} className="w-12 h-12 bg-white rounded-xl shadow-sm font-black text-emerald-600">+</button>
                </div>
             </div>
          </div>
        )}
      </div>

      <button 
        onClick={() => onStart({ level, count, mode, time: jogTime, bpm })}
        className="w-full py-8 bg-blue-600 text-white text-4xl font-black rounded-[50px] shadow-2xl border-b-[12px] border-blue-800 active:scale-95 transition-all flex items-center justify-center gap-4"
      >
        <span>🏃‍♂️</span> {mode === 'jogging' ? '開始超慢跑' : '進入遊戲'}
      </button>
    </div>
  );
};

export default ObstacleConfigView;
