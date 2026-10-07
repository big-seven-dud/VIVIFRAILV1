
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
    const imageMap: Record<typeof type, string> = {
      parallel: '/images/sppb/parallel.png',
      semi: '/images/sppb/semi.png',
      tandem: '/images/sppb/tandem.png',
      chair: '/images/sppb/chair.png',
      walk: '/images/sppb/walk.png',
    };
  
    return (
      <div className="w-full flex items-center justify-center">
        <img
          src={imageMap[type]}
          alt={`${title} 示意圖`}
          className="w-full max-w-lg max-h-[420px] object-contain"
        />
      </div>
    );
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
        <div className="mb-10 w-full flex justify-center">
          {renderDemo()}
        </div>
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
