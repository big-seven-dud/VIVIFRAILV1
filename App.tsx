
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppStep, INITIAL_RESULTS, TestResult, UserSettings, SelectedTests, UserProfile } from './types';
import HomeView from './components/HomeView';
import SelectionView from './components/SelectionView';
import PositioningView from './components/PositioningView';
import TestIntroView from './components/TestIntroView';
import TestExecView from './components/TestExecView';
import ResultsView from './components/ResultsView';
import AccessibilityBar from './components/AccessibilityBar';
import LoginView from './components/LoginView';
import RegisterView from './components/RegisterView';
import MainMenuView from './components/MainMenuView';
import HistoryView from './components/HistoryView';
import SurveyView from './components/SurveyView';
import IcopeSurveyView from './components/IcopeSurveyView';
import SurveySelectionView from './components/SurveySelectionView';
import GameSelectionView from './components/GameSelectionView';
import ObstacleConfigView from './components/ObstacleConfigView';
import ObstacleRaceView from './components/ObstacleRaceView';
import BoxingConfigView from './components/BoxingConfigView';
import BoxingGameView from './components/BoxingGameView';
import BubbleConfigView from './components/BubbleConfigView';
import BubbleShooterGameView from './components/BubbleShooterGameView';
import SoccerConfigView from './components/SoccerConfigView';
import SoccerGameView from './components/SoccerGameView';
import { LocalDbService, initDb } from './src/lib/LocalStorageService';
// import { auth, db } from './firebase';
// import { onAuthStateChanged, signOut } from 'firebase/auth';
// import { doc, getDoc, addDoc, collection, getDocFromServer } from 'firebase/firestore';

const App: React.FC = () => {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [step, setStep] = useState<AppStep>(AppStep.LOGIN);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<TestResult>(INITIAL_RESULTS);
  const [selectedTests, setSelectedTests] = useState<SelectedTests>({
    balance: true,
    walk: true,
    chair: true,
    tug: false,
    walk6m: false
  });
  const [settings, setSettings] = useState<UserSettings>({
    fontSize: 1.1,
    highContrast: false,
    voiceAssist: true,
    layout: 'landscape'
  });
  const [walkTrial, setWalkTrial] = useState<1 | 2>(1);
  const [walk6mTrial, setWalk6mTrial] = useState<1 | 2>(1);
  const [gameConfig, setGameConfig] = useState<{ 
    level: 'A' | 'B' | 'C' | 'D', 
    count: number, 
    mode: 'normal' | 'jogging', 
    time?: number, 
    targetCount?: number, 
    bpm?: number 
  }>({ level: 'A', count: 10, mode: 'normal' });

  useEffect(() => {
    initDb().then(() => {
      // Check local storage/IDB for user/settings
      const savedSettings = LocalDbService.getSettings();
      if (savedSettings) setSettings(savedSettings);

      const checkLocalUser = () => {
        const storedUser = localStorage.getItem('vivifrail_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
          setStep(AppStep.MAIN_MENU);
        } else {
          setStep(AppStep.LOGIN);
        }
      };
      checkLocalUser();
      setDbLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (dbLoaded) {
      LocalDbService.saveSettings(settings);
    }
  }, [settings, dbLoaded]);

  const speak = useCallback((text: string) => {
    if (!settings.voiceAssist) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [settings.voiceAssist]);

  const reset = () => {
    setStep(AppStep.MAIN_MENU);
    setResults(INITIAL_RESULTS);
  };

  const lastSavedResultRef = useRef<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveFinalResults = async (data: TestResult) => {
    if (!user) return;
    
    // Create a fingerprint
    const fingerprint = `${data.balanceScore}-${data.walkScore}-${data.chairScore}-${data.rawWalkTime}-${data.rawChairTime}-${data.rawBalanceSideBySide}-${data.rawBalanceSemiTandem}-${data.rawBalanceTandem}`;
    if (lastSavedResultRef.current === fingerprint) return;

    // Immediately set ref to prevent loop/concurrent calls
    lastSavedResultRef.current = fingerprint;
    
    setIsSyncing(true);
    setSaveError(null);

    const timestamp = Date.now();
    try {
      const payload = {
        mode: 'sppb' as any,
        score: Number((data.balanceScore || 0) + (data.walkScore || 0) + (data.chairScore || 0)),
        details: {
          balanceScore: Number(data.balanceScore || 0),
          walkScore: Number(data.walkScore || 0),
          chairScore: Number(data.chairScore || 0),
          rawBalanceSideBySide: Number(data.rawBalanceSideBySide || 0),
          rawBalanceSemiTandem: Number(data.rawBalanceSemiTandem || 0),
          rawBalanceTandem: Number(data.rawBalanceTandem || 0),
          walkTrial1: Number(data.walkTrial1 || 0),
          walkTrial2: Number(data.walkTrial2 || 0),
          rawWalkTime: Number(data.rawWalkTime || 0),
          rawChairTime: Number(data.rawChairTime || 0),
          rawTugTime: Number(data.rawTugTime || 0),
          rawWalk6mTime: Number(data.rawWalk6mTime || 0),
          chairReps: data.chairReps || [],
          fallRisk: data.fallRisk
        },
        user: {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          age: user.age,
          gender: user.gender,
          height: user.height,
          weight: user.weight
        }
      };
      
      LocalDbService.saveTestResult(payload);
      setResults(prev => ({ ...prev, timestamp }));
      console.log("Local save successful.");
    } catch (e: any) {
      console.error("Error saving result:", e);
      setSaveError(e.message || String(e));
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (step === AppStep.RESULTS && user) {
      // Check fingerprint here too for double safety
      const fingerprint = `${results.balanceScore}-${results.walkScore}-${results.chairScore}-${results.rawWalkTime}-${results.rawChairTime}-${results.rawBalanceSideBySide}-${results.rawBalanceSemiTandem}-${results.rawBalanceTandem}`;
      if (lastSavedResultRef.current !== fingerprint) {
        saveFinalResults(results);
      }
    } else if (step !== AppStep.RESULTS) {
      // Reset Ref when we leave results page
      lastSavedResultRef.current = "";
    }
  }, [step, user, results]);

  const saveGameResults = async (gameType: string, level: string, score: number, details?: any) => {
    if (!user) return;
    try {
      LocalDbService.saveTestResult({
        mode: gameType as any,
        score,
        details: { level, ...(details || {}) },
        user: {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          age: user.age,
          gender: user.gender,
          height: user.height,
          weight: user.weight
        }
      });
      console.log("Game result saved locally");
    } catch (e) {
      console.error("Error saving game result:", e);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('vivifrail_user');
    setUser(null);
    setStep(AppStep.LOGIN);
  };

  // Logic to calculate Walking Score (4 meters)
  const calculateWalkScore = (time: number): number => {
    if (time <= 0 || time > 60) return 0; // Unable to perform
    if (time < 4.82) return 4;
    if (time <= 6.20) return 3;
    if (time <= 8.70) return 2;
    if (time > 8.70) return 1;
    return 0;
  };

  // Logic to calculate Chair Score (5 times)
  const calculateChairScore = (time: number): number => {
    if (time <= 0 || time > 60) return 0; // 60s or Unable
    if (time < 11.20) return 4; // < 11.19 translates to < 11.20 in SPPB
    if (time <= 13.69) return 3;
    if (time <= 16.69) return 2;
    if (time < 60) return 1; // 16.7 - 60
    return 0;
  };

  const getFirstTestStep = (selected: SelectedTests) => {
    if (selected.balance) return AppStep.T1_PARALLEL_INTRO;
    if (selected.walk) return AppStep.T2_WALK_INTRO;
    if (selected.chair) return AppStep.T3_CHAIR_INTRO;
    if (selected.tug) return AppStep.T4_TUG_INTRO;
    if (selected.walk6m) return AppStep.T5_WALK6M_INTRO;
    return AppStep.RESULTS;
  };

  if (!dbLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans p-6 select-none">
        <div className="text-center flex flex-col items-center gap-6 max-w-md">
          {/* Elegant Spinning Loader */}
          <div className="relative flex items-center justify-center w-24 h-24">
            <div className="absolute w-20 h-20 border-4 border-blue-500/10 rounded-full"></div>
            <div className="absolute w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-4xl">💾</span>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white mb-2 font-sans">
              體能測試系統 Pro
            </h1>
            <p className="text-blue-400 font-bold mb-4 font-mono text-xs uppercase tracking-widest">
              IndexedDB local storage initialization
            </p>
            <p className="text-slate-400 text-sm">
              正在準備安全的本地瀏覽器資料庫，此功能將提供更大、更穩定的資料儲存空間...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen flex flex-col transition-colors duration-300 ${settings.highContrast ? 'bg-black text-yellow-400' : 'bg-slate-50 text-slate-900'}`}
      style={{ fontSize: `${settings.fontSize}rem` }}
    >
      <AccessibilityBar settings={settings} setSettings={setSettings} currentUser={user} />
      
      <main className={`flex-grow flex flex-col ${settings.layout === 'portrait' ? 'max-w-md' : 'max-w-3xl'} mx-auto w-full p-4 md:p-8 relative`}>
        {step === AppStep.LOGIN && (
          <LoginView 
            onLoginSuccess={(u) => { setUser(u); setStep(AppStep.MAIN_MENU); }}
            onGoToRegister={() => setStep(AppStep.REGISTER)}
          />
        )}
        {step === AppStep.REGISTER && (
          <RegisterView 
            onRegisterSuccess={(u) => { setUser(u); setStep(AppStep.MAIN_MENU); }}
            onGoToLogin={() => setStep(AppStep.LOGIN)}
          />
        )}
        {step === AppStep.MAIN_MENU && user && (
          <MainMenuView 
            user={user}
            onLogout={handleLogout}
            onSelect={(choice) => {
              if (choice === 'test') setStep(AppStep.HOME);
              if (choice === 'history') setStep(AppStep.HISTORY);
              if (choice === 'survey') setStep(AppStep.SURVEY_MENU);
              if (choice === 'game') setStep(AppStep.GAME_MENU);
            }}
          />
        )}
        {step === AppStep.HISTORY && user && (
          <HistoryView 
            user={user} 
            onBack={() => setStep(AppStep.MAIN_MENU)} 
            onUpdateProfile={(updatedUser) => {
              setUser(updatedUser);
              speak("個人資料已更新。");
            }}
          />
        )}

        {step === AppStep.SURVEY_MENU && (
          <SurveySelectionView 
            settings={settings}
            onBack={() => setStep(AppStep.MAIN_MENU)}
            onSelect={(type) => {
              if (type === 'fall_risk') setStep(AppStep.SURVEY_FALL_RISK);
              if (type === 'icope') setStep(AppStep.SURVEY_ICOPE);
            }}
          />
        )}

        {step === AppStep.SURVEY_ICOPE && user && (
          <IcopeSurveyView 
            user={user}
            settings={settings}
            speak={speak}
            onBack={() => setStep(AppStep.SURVEY_MENU)}
          />
        )}

        {step === AppStep.SURVEY_FALL_RISK && (
          <SurveyView 
            speak={speak}
            onBack={() => setStep(AppStep.SURVEY_MENU)}
            onComplete={async (survey) => {
              // Update state
              setResults(prev => ({ ...prev, fallRisk: survey }));
              
              // Save locally immediately
              if (user) {
                try {
                  LocalDbService.saveTestResult({
                    mode: 'fall_risk',
                    score: survey.hasRisk ? 1 : 0,
                    details: survey,
                    user: {
                      uid: user.uid,
                      displayName: user.displayName,
                      email: user.email,
                      age: user.age,
                      gender: user.gender,
                      height: user.height,
                      weight: user.weight
                    }
                  });
                } catch (e) {
                  console.error("Error saving survey:", e);
                }
              }

              speak(`評估完成。您被判定為${survey.hasRisk ? '有' : '無'}跌倒風險。`);
              setStep(AppStep.SURVEY_MENU);
            }}
          />
        )}

        {step === AppStep.GAME_MENU && (
          <GameSelectionView 
            settings={settings}
            user={user}
            onBack={() => setStep(AppStep.MAIN_MENU)}
            onSelect={(choice) => {
              if (choice === 'obstacle') setStep(AppStep.GAME_OBSTACLE_CONFIG);
              if (choice === 'boxing') setStep(AppStep.GAME_BOXING_CONFIG);
              if (choice === 'bubble') setStep(AppStep.GAME_BUBBLE_CONFIG);
              if (choice === 'soccer') setStep(AppStep.GAME_SOCCER_CONFIG);
            }}
          />
        )}

        {step === AppStep.GAME_SOCCER_CONFIG && (
          <SoccerConfigView 
            userId={user?.uid}
            onBack={() => setStep(AppStep.GAME_MENU)}
            onStart={(config) => {
              setGameConfig({ ...config, count: 12 });
              setStep(AppStep.GAME_SOCCER_EXEC);
            }}
          />
        )}

        {step === AppStep.GAME_SOCCER_EXEC && (
          <SoccerGameView 
            settings={settings}
            config={{
              level: gameConfig.level,
              time: gameConfig.time || 60
            }}
            onComplete={(score, details) => {
              saveGameResults('soccer', gameConfig.level, score, details);
              speak(`足球訓練結束！您的總得分是 ${score} 分。已存入中心紀錄。`);
              setStep(AppStep.GAME_MENU);
            }}
            onCancel={() => setStep(AppStep.GAME_MENU)}
            speak={speak}
          />
        )}

        {step === AppStep.GAME_OBSTACLE_CONFIG && (
          <ObstacleConfigView 
            userId={user?.uid}
            onBack={() => setStep(AppStep.GAME_MENU)}
            onStart={(config) => {
              setGameConfig(config);
              setStep(AppStep.GAME_OBSTACLE_RACE);
            }}
          />
        )}

        {step === AppStep.GAME_OBSTACLE_RACE && (
          <div className="fixed inset-0 z-50 bg-black">
            <ObstacleRaceView 
              settings={settings}
              config={gameConfig}
              speak={speak}
              onCancel={() => setStep(AppStep.GAME_MENU)}
              onComplete={(combo, details) => {
                saveGameResults('obstacle_race', gameConfig.level, combo, details);
                speak(`恭喜完成！您的最大連擊次數為 ${combo} 次。已存入紀錄。`);
                setStep(AppStep.GAME_MENU);
              }}
            />
          </div>
        )}

        {step === AppStep.GAME_BOXING_CONFIG && (
          <BoxingConfigView 
            userId={user?.uid}
            onBack={() => setStep(AppStep.GAME_MENU)}
            onStart={(config) => {
              setGameConfig({ ...config, count: config.targetCount });
              setStep(AppStep.GAME_BOXING_EXEC);
            }}
          />
        )}

        {step === AppStep.GAME_BOXING_EXEC && (
          <BoxingGameView 
            settings={settings}
            config={{
              level: gameConfig.level,
              time: gameConfig.time || 60,
              targetCount: gameConfig.count || 10
            }}
            onComplete={(score, details) => {
              saveGameResults('boxing', gameConfig.level, score, details);
              speak(`拳擊挑戰結束！您的總得分是 ${score} 分。已存入中心紀錄。`);
              setStep(AppStep.GAME_MENU);
            }}
            onCancel={() => setStep(AppStep.GAME_MENU)}
            speak={speak}
          />
        )}

        {step === AppStep.GAME_BUBBLE_CONFIG && (
          <BubbleConfigView 
            userId={user?.uid}
            onBack={() => setStep(AppStep.GAME_MENU)}
            onStart={(config) => {
              setGameConfig({ ...config, count: config.targetCount });
              setStep(AppStep.GAME_BUBBLE_EXEC);
            }}
          />
        )}

        {step === AppStep.GAME_BUBBLE_EXEC && (
          <BubbleShooterGameView 
            settings={settings}
            config={{
              level: gameConfig.level,
              time: gameConfig.time || 60,
              targetCount: gameConfig.count || 3
            }}
            onComplete={(score, details) => {
              saveGameResults('bubble', gameConfig.level, score, details);
              speak(`泡泡射擊挑戰結束！您的總得分是 ${score} 分。已存入中心紀錄。`);
              setStep(AppStep.GAME_MENU);
            }}
            onCancel={() => setStep(AppStep.GAME_MENU)}
            speak={speak}
          />
        )}

        {step === AppStep.HOME && <HomeView onStart={() => setStep(AppStep.SELECTION)} speak={speak} />}
        
        {step === AppStep.SELECTION && (
          <SelectionView 
            settings={settings}
            speak={speak}
            onBack={() => setStep(AppStep.MAIN_MENU)}
            onNext={(selected) => {
              setSelectedTests(selected);
              setStep(AppStep.POSITIONING);
            }}
          />
        )}

        {step === AppStep.POSITIONING && (
          <PositioningView 
            settings={settings}
            onNext={() => setStep(getFirstTestStep(selectedTests))} 
            onBack={() => setStep(AppStep.SELECTION)} 
            speak={speak} 
          />
        )}
        
        {/* Test 1: Balance - Parallel (Step 1 of 3) */}
        {step === AppStep.T1_PARALLEL_INTRO && (
          <TestIntroView 
            type="parallel" 
            title="測試 1：雙腳並排站立" 
            description="雙腳並排站立對齊紅色腳印。維持 10 秒得 1 分。" 
            onStart={() => setStep(AppStep.T1_PARALLEL_EXEC)} 
            onBack={() => setStep(AppStep.POSITIONING)} 
            onSkip={() => {
              setResults(r => ({ ...r, balanceScore: 0, rawBalanceSideBySide: 0 }));
              speak("已跳過此項測試。接下來進行下一個測試。");
              setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T1_PARALLEL_EXEC && <TestExecView settings={settings} mode="duration" targetSeconds={10} onComplete={(seconds) => {
          const passed = seconds >= 10;
          const score = passed ? 1 : 0;
          setResults(r => ({ ...r, balanceScore: score, rawBalanceSideBySide: seconds }));
          
          if (!passed) {
            speak("並排站立未達10秒，平衡測試結束。接下來進行下一個測試。");
            setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
          } else {
            setStep(AppStep.T1_SEMI_INTRO);
          }
        }} onCancel={() => setStep(AppStep.HOME)} speak={speak} />}

        {/* Test 1: Balance - Semi-Tandem (Step 2 of 3) */}
        {step === AppStep.T1_SEMI_INTRO && (
          <TestIntroView 
            type="semi" 
            title="測試 1：雙腳半並排站立" 
            description="雙腳半並排站立對齊黃色腳印。維持 10 秒得 1 分。" 
            onStart={() => setStep(AppStep.T1_SEMI_EXEC)} 
            onBack={() => setStep(AppStep.T1_PARALLEL_INTRO)} 
            onSkip={() => {
              setResults(r => ({ ...r, rawBalanceSemiTandem: 0 }));
              speak("已跳過此項測試。接下來進行下一個測試。");
              setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T1_SEMI_EXEC && <TestExecView settings={settings} mode="duration" targetSeconds={10} onComplete={(seconds) => {
          const passed = seconds >= 10;
          const score = passed ? 1 : 0;
          setResults(r => ({ ...r, balanceScore: r.balanceScore + score, rawBalanceSemiTandem: seconds }));
          
          if (!passed) {
            speak("半並排站立未達10秒，平衡測試結束。接下來進行下一個測試。");
            setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
          } else {
            setStep(AppStep.T1_TANDEM_INTRO);
          }
        }} onCancel={() => setStep(AppStep.HOME)} speak={speak} />}

        {/* Test 1: Balance - Tandem (Step 3 of 3) */}
        {step === AppStep.T1_TANDEM_INTRO && (
          <TestIntroView 
            type="tandem" 
            title="測試 1：雙腳直線站立" 
            description="雙腳直線站立對齊白色腳印。10秒(2分), 3-9秒(1分), 低於3秒(0分)。" 
            onStart={() => setStep(AppStep.T1_TANDEM_EXEC)} 
            onBack={() => setStep(AppStep.T1_SEMI_INTRO)} 
            onSkip={() => {
              setResults(r => ({ ...r, rawBalanceTandem: 0 }));
              speak("已跳過此項測試。接下來進行下一個測試。");
              setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T1_TANDEM_EXEC && <TestExecView settings={settings} mode="duration" targetSeconds={10} onComplete={(seconds) => {
          let score = 0;
          if (seconds >= 10) score = 2;
          else if (seconds >= 3) score = 1;
          
          setResults(r => ({ ...r, balanceScore: r.balanceScore + score, rawBalanceTandem: seconds }));
          speak("平衡測試結束。接下來進行下一個測試。");
          setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS));
        }} onCancel={() => setStep(AppStep.HOME)} speak={speak} />}

        {/* Test 2: Walk */}
        {step === AppStep.T2_WALK_INTRO && (
          <TestIntroView 
            type="walk" 
            title={`測試 2：步行速度測試 (${walkTrial}/2)`} 
            description="請以正常速度行走 4 公尺。系統將進行兩次測量並取最快時間。" 
            onStart={() => setStep(AppStep.T2_WALK_EXEC)} 
            onBack={() => setStep(selectedTests.balance ? AppStep.T1_TANDEM_INTRO : AppStep.POSITIONING)} 
            onSkip={() => {
              setResults(r => ({ ...r, walkScore: 0, rawWalkTime: 0, walkTrial1: 0, walkTrial2: 0 }));
              speak("已跳過此項測試。接下來進行下一個測試。");
              setStep(selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS);
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T2_WALK_EXEC && <TestExecView settings={settings} mode="stopwatch" label="走完請「舉手」或按按鈕停止" onComplete={(time) => {
          if (walkTrial === 1) {
            setResults(r => ({ ...r, walkTrial1: time }));
            setWalkTrial(2);
            speak("第一趟完成！請回到起點，準備進行第二趟。");
            setStep(AppStep.T2_WALK_INTRO);
          } else {
            setResults(r => {
              const bestTime = Math.min(r.walkTrial1 > 0 ? r.walkTrial1 : time, time);
              return { ...r, walkTrial2: time, rawWalkTime: bestTime, walkScore: calculateWalkScore(bestTime) };
            });
            setWalkTrial(1); // Reset for next time
            setStep(selectedTests.chair ? AppStep.T3_CHAIR_INTRO : AppStep.RESULTS);
          }
        }} onCancel={() => {
          setStep(AppStep.HOME);
          setWalkTrial(1);
        }} speak={speak} />}

        {/* Test 3: Chair */}
        {step === AppStep.T3_CHAIR_INTRO && (
          <TestIntroView 
            type="chair" 
            title="測試 3：從椅子起身測試" 
            description="雙手放鬆放下，不要撐大腿，以最快速度完成起立坐下 5 次。系統測量總時間。" 
            onStart={() => setStep(AppStep.T3_CHAIR_EXEC)} 
            onBack={() => setStep(selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.balance ? AppStep.T1_TANDEM_INTRO : AppStep.POSITIONING))} 
            onSkip={() => {
              setResults(r => ({ ...r, chairScore: 0, rawChairTime: 0 }));
              speak("已跳過此項測試。即將顯示評估結果。");
              setStep(AppStep.RESULTS);
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T3_CHAIR_EXEC && <TestExecView settings={settings} mode="counter" targetCount={5} onComplete={(time, details) => {
          setResults(r => ({ ...r, rawChairTime: time, chairScore: calculateChairScore(time), chairReps: details }));
          setStep(selectedTests.tug ? AppStep.T4_TUG_INTRO : (selectedTests.walk6m ? AppStep.T5_WALK6M_INTRO : AppStep.RESULTS));
        }} onCancel={() => setStep(AppStep.MAIN_MENU)} speak={speak} />}
        
        {/* Test 4: TUG (起立行走測試) */}
        {step === AppStep.T4_TUG_INTRO && (
          <TestIntroView 
            type="chair" 
            title="測試 4：起立行走測試 (TUG)" 
            description="從椅子起身走 3 公尺，轉身回到椅子坐下。系統將自動偵測起身與坐下時間。" 
            onStart={() => setStep(AppStep.T4_TUG_EXEC)} 
            onBack={() => setStep(selectedTests.chair ? AppStep.T3_CHAIR_INTRO : (selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.balance ? AppStep.T1_TANDEM_INTRO : AppStep.POSITIONING)))} 
            onSkip={() => {
              setResults(r => ({ ...r, rawTugTime: 0 }));
              speak("已跳過此項測試。接下來進行下一個測試。");
              setStep(selectedTests.walk6m ? AppStep.T5_WALK6M_INTRO : AppStep.RESULTS);
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T4_TUG_EXEC && <TestExecView settings={settings} mode="tug" onComplete={(time) => {
          setResults(r => ({ ...r, rawTugTime: time }));
          speak(`測試完成，時間為 ${time.toFixed(1)} 秒。`);
          setStep(selectedTests.walk6m ? AppStep.T5_WALK6M_INTRO : AppStep.RESULTS);
        }} onCancel={() => setStep(AppStep.MAIN_MENU)} speak={speak} />}

        {/* Test 5: 6m Walk */}
        {step === AppStep.T5_WALK6M_INTRO && (
          <TestIntroView 
            type="walk" 
            title={`測試 5：6公尺步行測試 (${walk6mTrial}/2)`} 
            description="請以正常步速行走 6 公尺。系統將測量兩次並取最短時間。超過 7.5 秒表示有跌倒風險。" 
            onStart={() => setStep(AppStep.T5_WALK6M_EXEC)} 
            onBack={() => setStep(selectedTests.tug ? AppStep.T4_TUG_INTRO : (selectedTests.chair ? AppStep.T3_CHAIR_INTRO : (selectedTests.walk ? AppStep.T2_WALK_INTRO : (selectedTests.balance ? AppStep.T1_TANDEM_INTRO : AppStep.POSITIONING))))} 
            onSkip={() => {
              setResults(r => ({ ...r, rawWalk6mTime: 0 }));
              speak("已跳過此項測試。即將顯示評估結果。");
              setStep(AppStep.RESULTS);
            }}
            speak={speak} 
          />
        )}
        {step === AppStep.T5_WALK6M_EXEC && <TestExecView settings={settings} mode="stopwatch" label="走完請「舉手」或按按鈕停止" onComplete={(time) => {
          if (walk6mTrial === 1) {
            setResults(r => ({ ...r, rawWalk6mTime: time })); // Store temporarily in best time slot
            setWalk6mTrial(2);
            speak("第一趟完成！請回到起點，準備進行第二趟。");
            setStep(AppStep.T5_WALK6M_INTRO);
          } else {
            setResults(r => {
              const best6m = Math.min(r.rawWalk6mTime > 0 ? r.rawWalk6mTime : time, time);
              return { ...r, rawWalk6mTime: best6m };
            });
            setWalk6mTrial(1);
            setStep(AppStep.RESULTS);
          }
        }} onCancel={() => {
          setStep(AppStep.MAIN_MENU);
          setWalk6mTrial(1);
        }} speak={speak} />}
        
        {step === AppStep.RESULTS && user && (
          <ResultsView 
            results={results} 
            user={user} 
            onReset={reset} 
            speak={speak} 
            settings={settings} 
            saveError={saveError}
            isSyncing={isSyncing}
          />
        )}
      </main>

      <footer className="p-6 text-center opacity-50 text-sm">
        Vivifrail 體能評估助手 (醫院專業版) &copy; 2025
      </footer>
    </div>
  );
};

export default App;
