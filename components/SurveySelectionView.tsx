
import React from 'react';
import { UserSettings } from '../types';

interface Props {
  onSelect: (type: 'fall_risk' | 'icope') => void;
  onBack: () => void;
  settings: UserSettings;
}

const SurveySelectionView: React.FC<Props> = ({ onSelect, onBack, settings }) => {
  const surveys = [
    { 
      id: 'fall_risk', 
      title: '跌倒風險評估', 
      description: 'Vivifrail 跌倒風險初步篩檢', 
      icon: '⚠️',
      color: 'bg-red-50 text-red-600 border-red-100'
    },
    { 
      id: 'icope', 
      title: 'ICOPE 綜合照護評估', 
      description: 'WHO 高齡照護綜合評估 (認知、營養、視聽力、憂鬱、用藥及行動)', 
      icon: '📋',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-100'
    }
  ];

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">問卷調查中心</h2>
          <p className="text-xl text-slate-500 font-bold">請選擇要進行的評估項目</p>
        </div>
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg active:scale-95 transition"
        >
          返回
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {surveys.map((survey) => (
          <button
            key={survey.id}
            onClick={() => onSelect(survey.id as any)}
            className={`flex items-center p-8 rounded-[40px] border-4 text-left shadow-xl transition-all hover:scale-[1.02] active:scale-95 ${survey.color}`}
          >
            <div className="text-6xl mr-8 bg-white/50 w-24 h-24 flex items-center justify-center rounded-3xl shadow-inner">
              {survey.icon}
            </div>
            <div className="flex-grow">
              <h3 className="text-3xl font-black mb-2">{survey.title}</h3>
              <p className="text-xl font-bold opacity-80">{survey.description}</p>
            </div>
            <div className="text-4xl">➡️</div>
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border-4 border-blue-100 p-8 rounded-[40px] mt-8 flex items-start gap-6">
        <div className="text-4xl">💡</div>
        <p className="text-blue-700 text-xl font-bold leading-relaxed">
          定期填寫問卷能幫助我們更精確地追蹤您的健康狀態，並在體能測試結果中提供更精準的建議。
        </p>
      </div>
    </div>
  );
};

export default SurveySelectionView;
