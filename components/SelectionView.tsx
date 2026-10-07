
import React, { useState } from 'react';
import { SelectedTests, UserSettings } from '../types';

interface Props {
  onNext: (selected: SelectedTests) => void;
  onBack: () => void;
  speak: (t: string) => void;
  settings: UserSettings;
}

const SelectionView: React.FC<Props> = ({ onNext, onBack, speak, settings }) => {
  const [selected, setSelected] = useState<SelectedTests>({
    balance: true,
    walk: true,
    chair: true,
    tug: false,
    walk6m: false
  });

  const toggle = (key: keyof SelectedTests) => {
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNext = () => {
    if (!selected.balance && !selected.walk && !selected.chair && !selected.tug && !selected.walk6m) {
      speak("請至少選擇一項測試");
      return;
    }
    onNext(selected);
  };

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-black text-slate-800">選擇測試項目</h2>
        <p className="text-xl text-slate-500 font-bold">請勾選您想要進行的評估項目</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {[
          { id: 'balance', label: '平衡力測試', desc: '包含並排、半並排與直線站立' },
          { id: 'walk', label: '步行速度測試', desc: '測量行走 4 公尺的時間' },
          { id: 'chair', label: '起坐能力測試', desc: '測量連續起立坐下 5 次的時間', badge: 'ICOPE 測試' },
          { id: 'tug', label: '起立行走測試 (TUG)', desc: '紀錄起身後走3公尺返回坐下的時間', badge: '跌倒風險評估' },
          { id: 'walk6m', label: '6公尺步行測試', desc: '測量正常步速行走 6 公尺的時間', badge: '跌倒風險評定' }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => toggle(item.id as keyof SelectedTests)}
            className={`p-8 rounded-[32px] border-4 flex justify-between items-center transition-all relative ${
              selected[item.id as keyof SelectedTests]
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-100 bg-white'
            }`}
          >
            {item.badge && (
              <div className="absolute -top-3 left-8 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-black shadow-lg">
                {item.badge}
              </div>
            )}
            <div className="text-left">
              <span className={`text-3xl font-black block ${selected[item.id as keyof SelectedTests] ? 'text-blue-700' : 'text-slate-400'}`}>
                {item.label}
              </span>
              <span className="text-lg font-bold text-slate-400">{item.desc}</span>
            </div>
            <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center ${
              selected[item.id as keyof SelectedTests] ? 'bg-blue-500 border-blue-500' : 'border-slate-200'
            }`}>
              {selected[item.id as keyof SelectedTests] && (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col space-y-4">
        <button 
          onClick={handleNext}
          className="w-full py-8 bg-blue-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition"
        >
          下一步：開始準備
        </button>
        <button 
          onClick={onBack}
          className="w-full py-6 bg-slate-200 text-slate-600 text-2xl font-black rounded-[40px] active:scale-95 transition"
        >
          返回
        </button>
      </div>
    </div>
  );
};

export default SelectionView;
