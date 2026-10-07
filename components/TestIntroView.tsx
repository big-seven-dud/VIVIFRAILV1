
import React, { useEffect } from 'react';

interface Props {
  type: 'parallel' | 'semi' | 'tandem' | 'chair' | 'walk';
  title: string;
  description: string;
  onStart: () => void;
  onBack: () => void;
  onSkip?: () => void;
  speak: (t: string) => void;
}

const TestIntroView: React.FC<Props> = ({ type, title, description, onStart, onBack, onSkip, speak }) => {
  const [timeLeft, setTimeLeft] = React.useState(15);

  useEffect(() => {
    if (timeLeft === 0) {
      onStart();
    }
  }, [timeLeft, onStart]);

  useEffect(() => {
    const text = `${title}。${description}。請對其地面腳印指示。系統即將在十五秒後自動開始偵測。`;
    speak(text);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [title]);

  const renderDemo = () => {
    const mainColor = "#3b82f6";
    switch(type) {
      case 'chair':
        return (
          <div className="relative w-64 h-64 mx-auto">
            <svg viewBox="0 0 100 100" className="absolute inset-0">
              <rect x="30" y="60" width="40" height="5" rx="2" fill="#94a3b8" />
              <rect x="30" y="60" width="5" height="25" fill="#94a3b8" />
              <rect x="65" y="60" width="5" height="25" fill="#94a3b8" />
              <rect x="30" y="40" width="5" height="25" fill="#94a3b8" />
            </svg>
            <svg viewBox="0 0 100 100" className="absolute inset-0 animate-[bounce_2s_infinite]">
              <circle cx="50" cy="30" r="10" fill={mainColor} />
              <path d="M40 40 Q50 45 60 40 L55 65 H45 Z" fill={mainColor} />
            </svg>
            <div className="absolute bottom-0 w-full text-center text-blue-500 font-black text-2xl">請反覆起坐</div>
          </div>
        );
      default:
        return (
          <div className="w-64 h-64 mx-auto flex flex-col items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-48 h-48">
              <circle cx="50" cy="20" r="12" fill={mainColor} />
              <rect x="42" y="35" width="16" height="40" rx="8" fill={mainColor} />
              <rect x="38" y="80" width="10" height="15" rx="3" fill="#10b981" />
              <rect x="52" y="80" width="10" height="15" rx="3" fill="#10b981" />
            </svg>
            <div className="mt-4 text-green-600 font-black text-2xl">請維持姿勢站立</div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-grow py-4 text-center space-y-8">
      <div className="space-y-4">
        <h2 className="text-6xl font-black text-slate-800">{title}</h2>
        <div className="flex items-center justify-center gap-2">
          {Array.from({length: 15}).map((_, i) => (
            <div 
              key={i} 
              className={`h-4 rounded-full transition-all duration-500 ${i < (15 - timeLeft) ? 'w-8 bg-blue-500' : 'w-4 bg-slate-200'}`} 
            />
          ))}
        </div>
      </div>
      
      <div className="w-full max-w-2xl bg-white p-12 rounded-[60px] shadow-2xl border-4 border-slate-100 flex flex-col items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 h-2 bg-blue-500" style={{ width: `${((15 - timeLeft)/15)*100}%` }} />
        <div className="mb-10 p-8 bg-slate-50 rounded-full scale-125">{renderDemo()}</div>
        <p className="text-4xl font-bold leading-relaxed text-slate-700">
          {description}
        </p>
      </div>

      <div className="flex flex-col items-center">
        <div className="flex flex-col items-center gap-2">
          <div className="text-7xl font-black text-blue-600 animate-bounce">{timeLeft}</div>
          <div className="text-blue-600 font-black text-2xl uppercase tracking-widest">
            秒後自動開始
          </div>
        </div>
        <div className="flex items-center gap-6 mt-8">
          <button onClick={onBack} className="text-slate-400 font-bold text-2xl py-4 hover:underline">
            返回上一頁
          </button>
          
          {onSkip && (
            <button 
              onClick={onSkip}
              className="flex items-center gap-2 bg-slate-100 text-slate-500 font-bold text-2xl px-10 py-4 rounded-full hover:bg-slate-200 transition-colors"
            >
              <span>⏭️</span>
              直接跳過
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestIntroView;
