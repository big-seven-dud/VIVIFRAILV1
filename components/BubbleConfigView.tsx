import React, { useState, useEffect } from 'react';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  userId?: string;
  onStart: (config: { level: 'A' | 'B' | 'C' | 'D', time: number, targetCount: number }) => void;
  onBack: () => void;
}

const BubbleConfigView: React.FC<Props> = ({ userId, onStart, onBack }) => {
  const [level, setLevel] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [time, setTime] = useState(60);
  const [targetCount, setTargetCount] = useState(12);

  const levels = [
    { id: 'A', label: 'A 級 (失能者)', desc: '手部抓握(Pinch)：目標 3 組，每組應完成 12 次捏合抓握', defaultTime: 60, defaultCount: 12 },
    { id: 'B', label: 'B / B+ 級 (衰弱者)', desc: '手部抓握(Pinch)：目標 3 組，每組應完成 12 次捏合抓握', defaultTime: 60, defaultCount: 12 },
    { id: 'C', label: 'C / C+ 級 (衰弱前期者)', desc: '手部抓握(Pinch)：【條件觸發 C+ 才派案】目標 3 組，每組應完成 12 次', defaultTime: 60, defaultCount: 12 },
    { id: 'D', label: 'D 級 (健康者)', desc: '手部抓握(Pinch)：目標 3 組，每組應完成 12 次捏合抓握', defaultTime: 60, defaultCount: 12 }
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
          <h2 className="text-4xl font-black text-slate-800">經典泡泡射擊設定</h2>
          <p className="text-xl text-slate-500 font-bold">手部捏合與精細動作復健</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg text-lg">返回</button>
      </div>

      <div className="bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-lg space-y-8">
        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">1. 選擇精細度分級</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {levels.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLevelChange(l.id as any)}
                className={`p-6 rounded-[30px] border-4 text-left transition-all ${level === l.id ? 'bg-indigo-600 text-white border-indigo-700 shadow-xl scale-95' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{l.label}</span>
                  {level === l.id && <span className="text-2xl">🔮</span>}
                </div>
              </button>
            ))}
          </div>
          {selectedLevel && (
            <div className="p-6 bg-indigo-50 rounded-2xl border-2 border-indigo-100 animate-in fade-in slide-in-from-top-2">
               <p className="text-indigo-800 font-black text-xl">💡 難度與精細度說明</p>
               <p className="text-indigo-700 font-bold text-lg">{selectedLevel.desc}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="text-2xl font-black text-slate-700">2. 自訂訓練時間：<span className="text-indigo-600">{time}</span> 秒</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setTime(Math.max(30, time - 30))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">-</button>
              <div className="flex-grow h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(time/180)*100}%` }} />
              </div>
              <button onClick={() => setTime(Math.min(180, time + 30))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">+</button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-2xl font-black text-slate-700">3. 目標消除次數：<span className="text-indigo-600">{targetCount}</span> 次連擊</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setTargetCount(Math.max(2, targetCount - 1))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">-</button>
              <div className="flex-grow h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(targetCount/20)*100}%` }} />
              </div>
              <button onClick={() => setTargetCount(Math.min(20, targetCount + 1))} className="w-16 h-16 bg-slate-100 rounded-2xl text-2xl font-black shadow-inner active:scale-90 transition">+</button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl space-y-3">
          <p className="text-lg font-black text-slate-800">🎮 經典泡泡射擊操作指南：</p>
          <ul className="list-disc pl-5 text-slate-600 font-bold space-y-1 text-base">
            <li>請確保視訊鏡頭能清楚照到您的單手或雙手（推薦使用右/左側主力手）。</li>
            <li>在空中做出將 <span className="text-indigo-600 font-extrabold">大拇指 ＆ 食指「捏合（Pinch）」</span> 的動作，虛擬準心會自動吸附到底部彈弓。</li>
            <li>保持捏合並將手往後、往下拉，即可以調整發射的角度與力度，同時畫面會渲染輔助瞄準線。</li>
            <li>只要 <span className="text-emerald-600 font-extrabold">鬆開手指 (取消捏合)</span>，彩色泡泡便會射擊而出！</li>
            <li>彩色泡泡相連 <span className="text-rose-600 font-black">同色達 3 個以上</span> 即會觸發連鎖爆裂消除。失去連鎖支撐的泡泡會觸發重力雪崩掉落得分！</li>
          </ul>
        </div>

        <button 
          onClick={() => onStart({ level, time, targetCount })}
          className="w-full py-8 bg-indigo-600 hover:bg-indigo-700 text-white text-3xl font-black rounded-[30px] shadow-2xl active:scale-95 transition-transform border-b-[12px] border-indigo-800"
        >
          🔮 開始遠端手勢泡泡射擊
        </button>
      </div>
    </div>
  );
};

export default BubbleConfigView;
