
import React, { useState } from 'react';
import { FallRiskSurvey } from '../types';

interface Props {
  onComplete: (survey: FallRiskSurvey) => void;
  onBack: () => void;
  speak: (t: string) => void;
}

const SurveyView: React.FC<Props> = ({ onComplete, onBack, speak }) => {
  const [recentFalls, setRecentFalls] = useState<boolean | null>(null);
  const [cognitiveDecline, setCognitiveDecline] = useState<boolean | null>(null);

  const handleSubmit = () => {
    if (recentFalls === null || cognitiveDecline === null) {
      speak("請回答所有問題後再提交。");
      return;
    }

    const hasRisk = recentFalls || cognitiveDecline;
    onComplete({
      recentFalls,
      cognitiveDecline,
      hasRisk
    });
  };

  const Question = ({ label, description, value, onChange }: { label: string, description: string, value: boolean | null, onChange: (v: boolean) => void }) => (
    <div className="bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-lg space-y-6">
      <div>
        <h3 className="text-2xl font-black text-slate-800">{label}</h3>
        <p className="text-lg text-slate-500 font-bold mt-2">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onChange(true)}
          className={`py-6 rounded-[30px] text-2xl font-black transition-all border-b-8 ${value === true ? 'bg-red-500 text-white border-red-700 scale-95' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
        >
          是 (Yes)
        </button>
        <button 
          onClick={() => onChange(false)}
          className={`py-6 rounded-[30px] text-2xl font-black transition-all border-b-8 ${value === false ? 'bg-green-500 text-white border-green-700 scale-95' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
        >
          否 (No)
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">跌倒風險評估</h2>
          <p className="text-xl text-slate-500 font-bold">Vivifrail 初步篩檢問卷</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold">返回</button>
      </div>

      <div className="space-y-6">
        <Question 
          label="1. 近期跌倒狀況" 
          description="最近一年是否曾跌倒 2 次(含)以上？或 1 次嚴重到需就醫？" 
          value={recentFalls} 
          onChange={setRecentFalls} 
        />
        <Question 
          label="2. 認知功能狀況" 
          description="是否曾被診斷為有中度認知功能退化？" 
          value={cognitiveDecline} 
          onChange={setCognitiveDecline} 
        />
      </div>

      <button 
        onClick={handleSubmit}
        className="w-full py-8 bg-blue-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition-all mt-4 mb-10 border-b-[12px] border-blue-800"
      >
        提交評估並紀錄
      </button>
    </div>
  );
};

export default SurveyView;
