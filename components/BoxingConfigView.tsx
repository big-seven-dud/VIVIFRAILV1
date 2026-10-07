
import React, { useState, useEffect } from 'react';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  userId?: string;
  onStart: (config: { level: 'A' | 'B' | 'C' | 'D', time: number, targetCount: number }) => void;
  onBack: () => void;
}

const BoxingConfigView: React.FC<Props> = ({ userId, onStart, onBack }) => {
  const [level, setLevel] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [time, setTime] = useState(60);
  const [targetCount, setTargetCount] = useState(12);

  const levels = [
    { id: 'A', label: 'A 級 (失能者)', desc: '二頭彎舉/出拳訓練：目標 3 組，每組應完成 12 次', defaultTime: 60, defaultCount: 12 },
    { id: 'B', label: 'B / B+ 級 (衰弱者)', desc: '二頭彎舉/出拳訓練：目標 3 組，每組應完成 12 次', defaultTime: 60, defaultCount: 12 },
    { id: 'C', label: 'C / C+ 級 (衰弱前期者)', desc: '二頭彎舉/出拳訓練：目標 3 組，每組應完成 12 次', defaultTime: 60, defaultCount: 12 },
    { id: 'D', label: 'D 級 (健康者)', desc: '二頭彎舉/出拳訓練：目標 3 組，每組應完成 12 次', defaultTime: 60, defaultCount: 12 }
  ];

  useEffect(() => {
    const defaultLvl = LocalDbService.getDefaultUserLevel(userId || '');
    handleLevelChange(defaultLvl);
  }, [userId]);

  const handleLevelChange = (newLevel: 'A' | 'B' | 'C' | 'D') => {
    setLevel(newLevel);
    const config = levels.find(l => l.id === newLevel);
    if (config) {
      setTime(config.defaultTime);
      setTargetCount(config.defaultCount);
    }
  };

  const selectedLevel = levels.find(l => l.id === level);

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">拳擊挑戰設定</h2>
          <p className="text-xl text-slate-500 font-bold">自訂難度與訓練目標</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg">返回</button>
      </div>

      <div className="bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-lg space-y-8">
        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">1. 選擇技術分級</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {levels.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLevelChange(l.id as any)}
                className={`p-6 rounded-[30px] border-4 text-left transition-all ${level === l.id ? 'bg-orange-600 text-white border-orange-700 shadow-xl scale-95' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{l.label}</span>
                  {level === l.id && <span className="text-2xl">⚡</span>}
                </div>
              </button>
            ))}
          </div>
          {selectedLevel && (
            <div className="p-6 bg-orange-50 rounded-2xl border-2 border-orange-100 animate-in fade-in slide-in-from-top-2">
               <p className="text-orange-800 font-black text-xl">💡 難度說明</p>
               <p className="text-orange-700 font-bold text-lg">{selectedLevel.desc}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="text-2xl font-black text-slate-700">2. 訓練時間：<span className="text-orange-600">{time}</span> 秒</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setTime(Math.max(30, time - 30))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">-</button>
              <div className="flex-grow h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all" style={{ width: `${(time/180)*100}%` }} />
              </div>
              <button onClick={() => setTime(Math.min(180, time + 30))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">+</button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-2xl font-black text-slate-700">3. 沙包總數：<span className="text-orange-600">{targetCount}</span> 個</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setTargetCount(Math.max(5, targetCount - 5))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">-</button>
              <div className="flex-grow h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all" style={{ width: `${(targetCount/50)*100}%` }} />
              </div>
              <button onClick={() => setTargetCount(Math.min(50, targetCount + 5))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">+</button>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onStart({ level, time, targetCount })}
          className="w-full py-8 bg-orange-600 text-white text-3xl font-black rounded-[30px] shadow-2xl active:scale-95 transition-transform border-b-[12px] border-orange-800"
        >
          🥊 開始拳擊挑戰
        </button>
      </div>
    </div>
  );
};

export default BoxingConfigView;
