
import React, { useState, useEffect } from 'react';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  userId?: string;
  onStart: (config: { level: 'A' | 'B' | 'C' | 'D', time: number }) => void;
  onBack: () => void;
}

const SoccerConfigView: React.FC<Props> = ({ userId, onStart, onBack }) => {
  const [level, setLevel] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [time, setTime] = useState(60);

  const levels = [
    { id: 'A', label: 'A 級 (失能者)', desc: '踢腿訓練：目標 3 組，每組 12 次 (系統提示：需有人輔助/坐姿)', defaultTime: 60 },
    { id: 'B', label: 'B / B+ 級 (衰弱者)', desc: '踢腿訓練：【本級別處方非必要指派，亦可自主練習 12 次/組】', defaultTime: 60 },
    { id: 'C', label: 'C / C+ 級 (衰弱前期者)', desc: '踢腿訓練：目標 3 組，每組 12 次', defaultTime: 60 },
    { id: 'D', label: 'D 級 (健康者)', desc: '踢腿訓練：目標 3 組，每組 12 次', defaultTime: 60 }
  ];

  useEffect(() => {
    const defaultLvl = LocalDbService.getDefaultUserLevel(userId || '');
    setLevel(defaultLvl);
    const config = levels.find(l => l.id === defaultLvl);
    if (config) setTime(config.defaultTime);
  }, [userId]);

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">足球射門設定</h2>
          <p className="text-xl text-slate-500 font-bold">調節球門難度與練習時間</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg">返回</button>
      </div>

      <div className="bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-lg space-y-8">
        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">1. 選擇競技分級</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {levels.map((l) => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id as any)}
                className={`p-6 rounded-[30px] border-4 text-left transition-all ${level === l.id ? 'bg-green-600 text-white border-green-700 shadow-xl scale-95' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{l.label}</span>
                  {level === l.id && <span className="text-2xl">⚽</span>}
                </div>
                <p className={`text-sm font-bold mt-1 ${level === l.id ? 'opacity-80' : 'text-slate-400'}`}>{l.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-2xl font-black text-slate-700">2. 挑戰時間：<span className="text-green-600">{time}</span> 秒</label>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setTime(Math.max(30, time - 30))}
              className="w-20 h-20 bg-slate-100 rounded-2xl text-4xl font-black text-slate-500 shadow-inner flex items-center justify-center border-b-4 border-slate-200 active:scale-95 transition"
            >
              -
            </button>
            <div className="flex-grow h-6 bg-slate-100 rounded-full relative overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-300" 
                style={{ width: `${(time/180)*100}%` }}
              />
            </div>
            <button 
              onClick={() => setTime(Math.min(180, time + 30))}
              className="w-20 h-20 bg-slate-100 rounded-2xl text-4xl font-black text-slate-500 shadow-inner flex items-center justify-center border-b-4 border-slate-200 active:scale-95 transition"
            >
              +
            </button>
          </div>
        </div>

        <button 
          onClick={() => onStart({ level, time })}
          className="w-full py-8 bg-green-600 text-white text-3xl font-black rounded-[30px] shadow-2xl active:scale-95 transition-transform border-b-[12px] border-green-800"
        >
          ⚽ 開始足球訓練
        </button>
      </div>
    </div>
  );
};

export default SoccerConfigView;
