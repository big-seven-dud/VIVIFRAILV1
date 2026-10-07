
import React, { useEffect } from 'react';

interface Props {
  onStart: () => void;
  // Fix: Add speak property to Props to match usage in App.tsx
  speak: (t: string) => void;
}

const HomeView: React.FC<Props> = ({ onStart, speak }) => {
  // Fix: Use speak to provide a welcoming voice introduction for accessibility
  useEffect(() => {
    speak("歡迎使用 Vivifrail 體能測試助手。簡單、安全、快速，只需跟著指令完成五個動作即可評估體能狀況。請點擊開始測試。");
  }, [speak]);

  return (
    <div className="flex flex-col items-center justify-center flex-grow text-center space-y-8 py-10">
      <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-slate-800">Vivifrail 體能測試</h1>
        <p className="text-xl text-slate-500 leading-relaxed max-w-sm mx-auto">
          簡單、安全、快速
          <br />只需跟著指令完成五個動作
        </p>
      </div>

      <button
        onClick={onStart}
        className="w-full max-w-xs py-6 bg-blue-600 hover:bg-blue-700 text-white text-2xl font-bold rounded-2xl shadow-lg transform transition active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300"
      >
        開始測試
      </button>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded text-left mt-8">
        <h3 className="font-bold text-yellow-800">溫馨提醒：</h3>
        <ul className="text-yellow-700 list-disc ml-5 space-y-1">
          <li>測試時請穿著舒適運動鞋</li>
          <li>旁邊建議有家人陪同</li>
          <li>若感到不適請立即停止</li>
        </ul>
      </div>
    </div>
  );
};

export default HomeView;
