import React, { useState, useEffect } from 'react';
import { UserSettings, UserProfile } from '../types';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  onSelect: (game: 'obstacle' | 'boxing' | 'soccer' | 'bubble') => void;
  onBack: () => void;
  settings: UserSettings;
  user?: UserProfile | null;
}

const GameSelectionView: React.FC<Props> = ({ onSelect, onBack, settings, user }) => {
  const [reloadKey, setReloadKey] = useState(0);
  const [level, setLevel] = useState<string>('D');
  const [levelLabel, setLevelLabel] = useState<string>('健康者');
  const [levelColor, setLevelColor] = useState<string>('text-green-600 bg-green-50 border-green-200');
  const [exercises, setExercises] = useState<any[]>([]);
  const [gameCount, setGameCount] = useState<number>(0);

  useEffect(() => {
    const history = user?.uid ? LocalDbService.getHistoryByUser(user.uid) : LocalDbService.getHistory();
    const sppbRecords = history.filter(h => (h.mode as string) === 'sppb');
    
    let lvl = 'D';
    let label = '健康者';
    let color = 'text-green-600 bg-green-50 border-green-200';
    
    if (sppbRecords.length > 0) {
      // Sort to get the latest
      const latest = [...sppbRecords].sort((a,b) => b.timestamp - a.timestamp)[0];
      const score = (latest.score !== undefined) ? latest.score : ((latest.details?.balanceScore || 0) + (latest.details?.walkScore || 0) + (latest.details?.chairScore || 0));
      const walk6mTime = latest.details?.rawWalk6mTime || 0;
      const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
      
      if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) {
        lvl = 'A';
        label = '失能者';
        color = 'text-red-600 bg-red-50 border-red-200';
      } else if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) {
        lvl = 'B';
        label = '衰弱者';
        color = 'text-orange-600 bg-orange-50 border-orange-200';
      } else if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) {
        lvl = 'C';
        label = '衰弱前期者';
        color = 'text-blue-600 bg-blue-50 border-blue-200';
      } else {
        lvl = 'D';
        label = '健康者';
        color = 'text-green-600 bg-green-50 border-green-200';
      }
      
      const hasRisk = latest.details?.fallRisk?.hasRisk || (latest.details?.rawTugTime && latest.details?.rawTugTime > 20) || (latest.details?.rawWalk6mTime && latest.details?.rawWalk6mTime > 7.5);
      if (hasRisk && (lvl === 'B' || lvl === 'C')) {
        lvl += '+';
      }
    }

    setLevel(lvl);
    setLevelLabel(label);
    setLevelColor(color);

    // Get today's games played
    const today = new Date().toLocaleDateString();
    const todayRecords = history.filter(h => {
      if ((h.mode as string) === 'sppb') return false;
      const d = new Date(h.timestamp);
      return d.toLocaleDateString() === today;
    });

    setGameCount(todayRecords.filter(r => (r.mode as string) === 'obstacle_race' || (r.mode as string) === 'boxing' || (r.mode as string) === 'bubble').length);

    // Sum up reps
    const stats = {
      punch: 0,
      kick: 0,
      sitStand: 0,
      march: 0,
      boxingLeft: 0,
      boxingRight: 0,
      soccerGoal: 0,
      handgrip: 0
    };

    todayRecords.forEach(r => {
      if ((r.mode as string) === 'obstacle_race' && r.details?.stats) {
        stats.punch += (r.details.stats.punch || 0);
        stats.kick += (r.details.stats.kick || 0);
        stats.sitStand += (r.details.stats.sitStand || r.details.stats['sit-stand'] || 0);
        stats.march += (r.details.stats.march || 0);
      } else if ((r.mode as string) === 'boxing' && r.details) {
        stats.boxingLeft += (r.details.leftPunches || 0);
        stats.boxingRight += (r.details.rightPunches || 0);
      } else if ((r.mode as string) === 'soccer' && r.details) {
        stats.soccerGoal += (r.details.goals || 0);
      } else if ((r.mode as string) === 'handgrip') {
        stats.handgrip += (r.details?.reps || 12);
      } else if ((r.mode as string) === 'bubble' && r.details) {
        // Pinch actions count towards hand grip rehabilitation targets!
        stats.handgrip += (r.details.shotsCount || 0);
      }
    });

    // Build the exercises config based on the level
    const list = [];

    // 1. 原地走次數(超慢跑)
    let marchSets = 2;
    let marchReps = 500;
    if (lvl === 'A') {
      marchSets = 5;
      marchReps = 10;
    } else if (lvl === 'B' || lvl === 'B+') {
      marchSets = 5;
      marchReps = 100;
    } else if (lvl === 'C' || lvl === 'C+') {
      marchSets = 3;
      marchReps = 300;
    }
    list.push({
      id: 'march',
      name: '原地走次數(超慢跑)',
      sets: marchSets,
      reps: marchReps,
      current: stats.march,
      unit: '步',
      hint: '',
      icon: '👟'
    });

    // 2. 手部抓握
    const hasHandgrip = (lvl === 'A' || lvl === 'B' || lvl === 'B+' || lvl === 'D' || lvl === 'C+');
    if (hasHandgrip) {
      list.push({
        id: 'handgrip',
        name: '手部抓握',
        sets: 3,
        reps: 12,
        current: stats.handgrip,
        unit: '次',
        hint: '手握球發力進行抓握擠壓，鍛鍊手握力',
        icon: '✊'
      });
    }

    // 3. 二頭彎舉
    list.push({
      id: 'boxing',
      name: '二頭彎舉',
      sets: 3,
      reps: 12,
      current: stats.boxingLeft + stats.boxingRight,
      unit: '次',
      hint: '雙肘固定由下向上進行彎舉，鍛鍊上臂力量',
      icon: '💪'
    });

    // 坐站(或蹲起)
    let sitStandHint = '自主起身';
    if (lvl === 'A') {
      sitStandHint = '需有人輔助';
    } else if (lvl === 'B' || lvl === 'B+') {
      sitStandHint = '模擬坐下動作';
    }
    list.push({
      id: 'sitStand',
      name: '坐站(或蹲起)',
      sets: 3,
      reps: 12,
      current: stats.sitStand,
      unit: '次',
      hint: sitStandHint,
      icon: '🪑'
    });

    // 4. 踢腿 (A, C, C+, D)
    const hasKick = (lvl === 'A' || lvl === 'C' || lvl === 'C+' || lvl === 'D');
    if (hasKick) {
      list.push({
        id: 'kick',
        name: '踢腿',
        sets: 3,
        reps: 12,
        current: stats.kick + stats.soccerGoal,
        unit: '次',
        hint: '背部靠椅挺直，小腿向前踢平，鍛鍊大腿肌肌群力',
        icon: '🦵'
      });
    }

    // 5. 向上伸展 (C, C+, D, B+)
    const hasStretch = (lvl === 'C' || lvl === 'C+' || lvl === 'D' || lvl === 'B+');
    if (hasStretch) {
      list.push({
        id: 'stretch',
        name: '向上伸展',
        sets: 3,
        reps: 3,
        current: stats.punch,
        unit: '次',
        hint: '上身直立，雙手握拳朝上用力推直伸展',
        icon: '🙆‍♂️'
      });
    }

    setExercises(list);
  }, [reloadKey]);

  const handleLogHandgrip = () => {
    LocalDbService.saveTestResult({
      mode: 'bubble',
      score: 12,
      details: { reps: 12, gripAction: true },
      user: user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight
      } : undefined
    });
    setReloadKey(prev => prev + 1);
  };

  const formatProgressLabel = (item: any) => {
    const totalTarget = item.sets * item.reps;
    if (item.current >= totalTarget) {
      return '(已完成)';
    }
    if (item.current === 0) {
      return '(未開始)';
    }
    const currentSet = Math.min(item.sets, Math.floor(item.current / item.reps) + 1);
    return `(第 ${currentSet} / ${item.sets} 組進行中)`;
  };

  const games = [
    {
      id: 'obstacle',
      title: '健康障礙賽跑',
      description: '結合拳擊、路徑跟隨與坐站起臥的趣味運動遊戲',
      icon: '🏃‍♂️',
      color: 'bg-orange-50 text-orange-600 border-orange-100',
      tag: '綜合操',
      disabled: false
    },
    {
      id: 'boxing',
      title: '熱血沙包拳擊',
      description: '結合 AI 姿態辨識偵測出拳動作，打倒煩惱沙包',
      icon: '🥊',
      color: 'bg-red-50 text-red-600 border-red-100',
      tag: '上肢肌力',
      disabled: false
    },
    {
      id: 'bubble',
      title: '經典泡泡射擊 (Pinch 抓握)',
      description: '空中捏合(Pinch/捏拳)手勢拉動彈弓擊落彩色球，會直接計入住院或居家之「手部抓握」復健目標！',
      icon: '🔮',
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      tag: '手部抓握/精細肌力',
      disabled: false
    },
    {
      id: 'soccer',
      title: '足球射門 (踢腿訓練)',
      description: 'AI 姿態辨識偵測下肢抬腿踢球動作，射門得分訓練下肢與膝關節肌力',
      icon: '⚽',
      color: 'bg-green-50 text-green-600 border-green-100',
      tag: '下肢踢腿',
      disabled: false
    }
  ];

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-800">復健遊戲中心</h2>
          <p className="text-xl text-slate-500 font-bold">在遊戲中完成您的每日運動處方任務！</p>
        </div>
        <button onClick={onBack} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg text-lg">返回</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => !game.disabled && onSelect(game.id as any)}
            disabled={game.disabled}
            className={`relative flex items-center p-8 rounded-[40px] border-4 text-left shadow-xl transition-all ${game.disabled ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'} ${game.color}`}
          >
            {game.tag && (
              <span className={`absolute top-4 right-8 px-4 py-1 rounded-full text-base font-black ${game.disabled ? 'bg-slate-200 text-slate-400' : 'bg-orange-500 text-white'}`}>
                {game.tag}
              </span>
            )}
            <div className="text-6xl mr-8 bg-white/50 w-24 h-24 flex items-center justify-center rounded-3xl shadow-inner animate-pulse">
              {game.icon}
            </div>
            <div className="flex-grow">
              <h3 className="text-3xl font-black mb-2">{game.title}</h3>
              <p className="text-xl font-bold opacity-80">{game.description}</p>
            </div>
          </button>
        ))}
      </div>
      
      {/* Dynamic Exercise prescription block */}
      <div className="bg-slate-50 border-4 border-slate-200 p-8 rounded-[40px] shadow-lg space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b-2 border-slate-200 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🏆</span>
            <div>
              <h4 className="text-2xl font-black text-slate-800">今日個人化運動任務目標</h4>
              <p className="text-slate-500 font-bold text-base">目前今日已完訓：{gameCount} 次遊戲測試</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl border-2 font-black text-lg ${levelColor}`}>
            <span>等級：{level} 級 ({levelLabel})</span>
          </div>
        </div>

        <div className="space-y-4">
          {exercises.map((item) => {
            const totalTarget = item.sets * item.reps;
            const progressPercent = Math.min(100, (item.current / totalTarget) * 100);
            const isCompleted = item.current >= totalTarget;
            const stateLabel = formatProgressLabel(item);

            return (
              <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow">
                  <span className="text-4xl bg-slate-50 w-16 h-16 flex items-center justify-center rounded-2xl border border-slate-100 shadow-inner">
                    {item.icon}
                  </span>
                  <div className="space-y-1">
                    <p className="text-xl font-black text-slate-800 leading-snug">
                      {item.name}： <span className="text-indigo-600 font-extrabold">{item.current}</span> / {totalTarget} {item.unit} <span className={`ml-2 text-sm font-bold ${isCompleted ? 'text-emerald-600' : item.current === 0 ? 'text-slate-400' : 'text-amber-600'}`}>{stateLabel}</span>
                    </p>
                    {item.hint && (
                      <p className="text-sm font-black text-blue-500">
                        💡 系統提示：{item.hint}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Progress bar */}
                  <div className="w-32 bg-slate-100 h-3 rounded-full overflow-hidden hidden md:block border">
                    <div className={`h-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progressPercent}%` }} />
                  </div>

                  {/* Manual Log button for grab */}
                  {item.id === 'handgrip' && (
                    <button
                      onClick={handleLogHandgrip}
                      className="px-4 py-2 bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 text-purple-700 text-sm font-black rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1"
                    >
                      ✊ 登記完訓 1 組 (12次)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GameSelectionView;
