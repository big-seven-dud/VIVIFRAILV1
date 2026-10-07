import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Brain, 
  Eye, 
  Smile, 
  Pill, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  RotateCcw, 
  Volume2, 
  HelpCircle, 
  Ear,
  FileText,
  Accessibility,
  Apple
} from 'lucide-react';
import { LocalDbService } from '../src/lib/LocalStorageService';
import { IcopeSurvey, UserProfile, UserSettings } from '../types';

interface Props {
  user: UserProfile;
  settings: UserSettings;
  onBack: () => void;
  speak: (t: string) => void;
}

const DOMAINS = [
  { id: 'intro', title: '評估說明', icon: FileText, color: 'text-slate-600 bg-slate-100 border-slate-200' },
  { id: 'cognitive', title: '一、認知功能', icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { id: 'nutrition', title: '二、營養不良', icon: Apple, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { id: 'vision', title: '三、視力障礙', icon: Eye, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { id: 'depression', title: '四、憂鬱情形', icon: Smile, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  { id: 'hearing', title: '五、聽力測試', icon: Ear, color: 'text-pink-600 bg-pink-50 border-pink-100' },
  { id: 'medicine', title: '六、用藥安全', icon: Pill, color: 'text-teal-600 bg-teal-50 border-teal-100' },
  { id: 'mobility', title: '七、行動功能', icon: Accessibility, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { id: 'report', title: '評估總報告', icon: Activity, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' }
];

const RECALL_ITEMS = ['鉛筆', '香蕉', '汽車', '書', '鑰匙', '蘋果'];

const IcopeSurveyView: React.FC<Props> = ({ user, settings, onBack, speak }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);

  // Question State
  // 1. Cognitive
  const [cogMemory, setCogMemory] = useState<boolean | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [cogOrientLoc, setCogOrientLoc] = useState<boolean | null>(null);
  const [cogChoices, setCogChoices] = useState<string[]>([]);

  // 2. Nutrition
  const [nutWeight, setNutWeight] = useState<boolean | null>(null);
  const [nutAppetite, setNutAppetite] = useState<boolean | null>(null);

  // 3. Vision
  const [visDiabetes, setVisDiabetes] = useState<boolean | null>(null);
  const [visEyesight, setVisEyesight] = useState<boolean | null>(null); // For non-diabetic
  const [visCheckup, setVisCheckup] = useState<boolean | null>(null);   // For diabetic

  // 4. Depression
  const [depAnnoyed, setDepAnnoyed] = useState<boolean | null>(null);
  const [depActivities, setDepActivities] = useState<boolean | null>(null);

  // 5. Hearing
  const [hearRepeat, setHearRepeat] = useState<boolean | null>(null);

  // 6. Medication
  const [medCount, setMedCount] = useState<boolean | null>(null);
  const [medTypes, setMedTypes] = useState<boolean | null>(null);
  const [medSideEffects, setMedSideEffects] = useState<boolean | null>(null);

  // 7. Mobility
  const [mobChairTime, setMobChairTime] = useState<string>('');
  const [autoLoadedTime, setAutoLoadedTime] = useState<number | null>(null);
  const [touchedChairTime, setTouchedChairTime] = useState<boolean>(false);

  // Auto retrieve chair stand test results on Mount for CURRENT USER only
  useEffect(() => {
    try {
      if (!user?.uid) return;
      const userHistory = LocalDbService.getHistoryByUser(user.uid);
      const sppbRecords = userHistory.filter(h => (h.mode as string) === 'sppb');
      if (sppbRecords.length > 0) {
        // Sort descending by timestamp
        const sorted = [...sppbRecords].sort((a, b) => b.timestamp - a.timestamp);
        // Find the first one that has a rawChairTime
        const matched = sorted.find(r => r.details && r.details.rawChairTime > 0);
        if (matched && matched.details && matched.details.rawChairTime) {
          const rawSec = matched.details.rawChairTime;
          setAutoLoadedTime(rawSec);
          setMobChairTime(rawSec.toFixed(1));
        }
      }
    } catch (e) {
      console.error("Error loading chair stand history in ICOPE:", e);
    }
  }, [user.uid]);

  const handleSpeakerClick = (text: string) => {
    speak(text);
  };

  const handleChoiceToggle = (item: string) => {
    if (cogChoices.includes(item)) {
      setCogChoices(cogChoices.filter(x => x !== item));
    } else {
      if (cogChoices.length < 3) {
        setCogChoices([...cogChoices, item]);
      } else {
        speak("最多只能選 3 個物品喔！");
      }
    }
  };

  // Evaluate outcomes for each domain
  const getDomainResults = () => {
    // Cognitive Function (任一結果為否即為初評有問題，需關切並復評)
    // 4. 選擇題選擇剛剛第一題的物體，看看是否能記住三個 (這3個必須是 鉛筆, 汽車, 書)
    const today = new Date();
    const isDateCorrect = parseInt(selectedYear) === today.getFullYear() && 
                          parseInt(selectedMonth) === (today.getMonth() + 1) && 
                          parseInt(selectedDay) === today.getDate();
    const hasAllThreeChoices = cogChoices.includes('鉛筆') && cogChoices.includes('汽車') && cogChoices.includes('書');
    const isCognitiveDeficit = cogMemory === false || !isDateCorrect || cogOrientLoc === false || !hasAllThreeChoices;

    // Nutrition (任一結果為是即為初評有問題，需關切並復評)
    const isNutritionDeficit = nutWeight === true || nutAppetite === true;

    // Vision (第二題為是，有問題。第二題看糖尿病狀態而定)
    const isVisionDeficit = visDiabetes === true ? visCheckup === true : visEyesight === true;

    // Depression (任一結果為是即為初評有問題，需關切並復評)
    const isDepressionDeficit = depAnnoyed === true || depActivities === true;

    // Hearing (結果為否即為初評有問題，需關切並復評)
    const isHearingDeficit = hearRepeat === false;

    // Medication (任一結果為是即為初評有問題，需關切並復評)
    const isMedicineDeficit = medCount === true || medTypes === true || medSideEffects === true;

    // Mobility (超過 12秒即為初評有問題)
    const parsedTime = parseFloat(mobChairTime) || 0;
    const isMobilityDeficit = parsedTime > 12 || parsedTime === 0;

    return {
      cognitive: isCognitiveDeficit,
      nutrition: isNutritionDeficit,
      vision: isVisionDeficit,
      depression: isDepressionDeficit,
      hearing: isHearingDeficit,
      medicine: isMedicineDeficit,
      mobility: isMobilityDeficit
    };
  };

  const handleSaveReport = () => {
    const issues = getDomainResults();
    const parsedTime = parseFloat(mobChairTime) || 0;
    const totalDeficits = Object.values(issues).filter(Boolean).length;

    const today = new Date();
    const isDateCorrect = parseInt(selectedYear) === today.getFullYear() && 
                          parseInt(selectedMonth) === (today.getMonth() + 1) && 
                          parseInt(selectedDay) === today.getDate();

    const reportData: IcopeSurvey = {
      cognitive_memory: !!cogMemory,
      cognitive_orientation1: isDateCorrect,
      cognitive_orientation2: !!cogOrientLoc,
      cognitive_choices: cogChoices,
      nutrition_weight: !!nutWeight,
      nutrition_appetite: !!nutAppetite,
      vision_diabetes: !!visDiabetes,
      vision_eyesight: !!visEyesight,
      vision_checkup: !!visCheckup,
      depression_annoyed: !!depAnnoyed,
      depression_activities: !!depActivities,
      hearing_repeat: !!hearRepeat,
      medicine_count: !!medCount,
      medicine_types: !!medTypes,
      medicine_side_effects: !!medSideEffects,
      mobility_chair_time: parsedTime,
      hasIssues: issues
    };

    try {
      LocalDbService.saveTestResult({
        mode: 'icope',
        score: totalDeficits,
        details: {
          surveyType: 'icope',
          ...reportData
        },
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          age: user.age,
          gender: user.gender,
          height: user.height,
          weight: user.weight
        }
      });
      speak("ICOPE 評估結果已成功儲存！");
      onBack();
    } catch (err) {
      console.error("Save ICOPE error:", err);
      speak("儲存時發生錯誤。");
    }
  };

  const isNextDisabled = () => {
    if (currentStep === 0) return false;
    if (currentStep === 1) {
      return cogMemory === null || !selectedYear || !selectedMonth || !selectedDay || cogOrientLoc === null || cogChoices.length !== 3;
    }
    if (currentStep === 2) {
      return nutWeight === null || nutAppetite === null;
    }
    if (currentStep === 3) {
      if (visDiabetes === null) return true;
      if (visDiabetes === true) return visCheckup === null;
      return visEyesight === null;
    }
    if (currentStep === 4) {
      return depAnnoyed === null || depActivities === null;
    }
    if (currentStep === 5) {
      return hearRepeat === null;
    }
    if (currentStep === 6) {
      return medCount === null || medTypes === null || medSideEffects === null;
    }
    if (currentStep === 7) {
      const parsed = parseFloat(mobChairTime);
      return isNaN(parsed) || parsed < 0;
    }
    return false;
  };

  const progressPercentage = (currentStep / (DOMAINS.length - 1)) * 100;

  const currentDomain = DOMAINS[currentStep];
  const DomainIcon = currentDomain.icon;

  const today = new Date();
  const isDateCorrect = parseInt(selectedYear) === today.getFullYear() && 
                        parseInt(selectedMonth) === (today.getMonth() + 1) && 
                        parseInt(selectedDay) === today.getDate();
  const hasAllThreeChoices = cogChoices.includes('鉛筆') && cogChoices.includes('汽車') && cogChoices.includes('書');

  return (
    <div className="flex flex-col space-y-8 py-6 w-full max-w-4xl mx-auto">
      {/* Top Title Bar */}
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-6 rounded-[30px] border-4 border-slate-100 shadow-md">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800">ICOPE 高齡照護綜合評估</h2>
            <p className="text-sm font-bold text-slate-400">適於高齡家屬的生理與認知初評篩檢</p>
          </div>
        </div>
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full font-black text-lg transition shadow-md active:scale-95"
        >
          放棄返回
        </button>
      </div>

      {/* Progress Tracker */}
      <div className="bg-white p-6 rounded-[30px] border-4 border-slate-100 shadow-md">
        <div className="flex justify-between text-base font-black text-slate-500 mb-3">
          <span>評估進度 (分站：{currentStep} / {DOMAINS.length - 1})</span>
          <span className="text-indigo-600 font-black">{currentDomain.title}</span>
        </div>
        <div className="w-full bg-slate-100 h-5 rounded-full overflow-hidden border-2 border-slate-200">
          <div 
            className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Domain Content Card Wrapper */}
      <div className="min-h-[450px] bg-white rounded-[40px] border-4 border-indigo-100 shadow-2xl p-8 md:p-10 flex flex-col justify-between relative overflow-hidden">
        
        {/* Domain Badge */}
        <div className="flex items-center gap-3 border-b-4 border-slate-100 pb-6 mb-6">
          <div className={`p-4 rounded-2xl border-2 ${currentDomain.color}`}>
            <DomainIcon className="w-8 h-8" />
          </div>
          <h3 className="text-3xl font-black text-slate-800">{currentDomain.title}</h3>
        </div>

        {/* Wizard Slide Body */}
        <div className="flex-1">
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="bg-indigo-50 border-4 border-indigo-100 p-6 rounded-[30px] text-indigo-900 leading-relaxed font-bold text-xl">
                歡迎使用 <strong>WHO ICOPE (Integrated Care for Older People) 綜合評估</strong>。
                此工具可幫助篩檢高齡長者的七大關鍵能力：認知、營養、視力、憂鬱、聽力、用藥以及行動。
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base font-bold text-slate-600">
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">🧠</span> <strong>認知功能：</strong> 記憶力、定向力衰退篩檢
                </li>
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">🍎</span> <strong>營養不良：</strong> 食慾與無意體重減輕
                </li>
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">👁️</span> <strong>視力障礙：</strong> 糖尿病史與日常生活困窘
                </li>
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">👂</span> <strong>聽力測試：</strong> 三數字字音語音辨識
                </li>
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">💊</span> <strong>用藥安全：</strong> 10種以上用藥及抗精神藥副作用
                </li>
                <li className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-2xl">🏃‍♂️</span> <strong>行動功能：</strong> 自動帶入起立坐下測試時間
                </li>
              </ul>
              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => {
                    speak("請由施測者配合引導長者回答問題，我們現在開始評估。");
                    setCurrentStep(1);
                  }}
                  className="px-12 py-5 bg-indigo-600 text-white text-2xl font-black rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all outline-none border-b-8 border-indigo-900"
                >
                  開始評估 🚀
                </button>
              </div>
            </div>
          )}

          {/* Dom 1: Cognitive */}
          {currentStep === 1 && (
            <div className="space-y-8">
              <div className="bg-purple-50 p-4 rounded-2xl border-l-[6px] border-purple-500 text-purple-900 font-bold flex justify-between items-center">
                <span>💡 評估規則：本區由您本人填答。請依照真實感受與情況點選合適的選項 </span>
                <button 
                  onClick={() => handleSpeakerClick("現在進行認知功能測試。請聽指令：請跟著唸出三項物品，鉛筆、汽車、書，並努力在腦袋裡記住喔。")}
                  className="bg-purple-200 hover:bg-purple-300 p-2 rounded-full text-purple-900 transition"
                  title="播放引導語音"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              {/* Memory Repeat */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black bg-purple-600 text-white w-7 h-7 flex items-center justify-center rounded-full text-xs">1</span>
                  <h4 className="text-2xl font-black text-slate-800">記憶認讀：請大聲朗讀以下三個物品，並努力記在腦袋裡</h4>
                </div>
                <p className="text-lg text-slate-500 font-bold ml-9">
                  請看著以下三樣東西大聲唸一遍，並牢牢記住喔（等等會考您）：
                </p>
                <div className="grid grid-cols-3 gap-4 ml-9 my-3">
                  <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-3xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-5xl mb-1">✏️</span>
                    <span className="text-2xl font-black text-purple-950">鉛筆</span>
                  </div>
                  <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-3xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-5xl mb-1">🚗</span>
                    <span className="text-2xl font-black text-purple-950">汽車</span>
                  </div>
                  <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-3xl flex flex-col items-center justify-center shadow-sm">
                    <span className="text-5xl mb-1">📖</span>
                    <span className="text-2xl font-black text-purple-950">書</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 ml-9">
                  <button
                    onClick={() => {
                      setCogMemory(true);
                      speak("好的，請用心記牢這三樣物品喔。");
                    }}
                    className={`py-4 px-3 rounded-2xl text-xl font-bold border-2 transition-all ${cogMemory === true ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-95' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    👍 我大聲重複唸了，也努力記住了
                  </button>
                  <button
                    onClick={() => {
                      setCogMemory(false);
                      speak("沒關係，放輕鬆繼續下一題。");
                    }}
                    className={`py-4 px-3 rounded-2xl text-xl font-bold border-2 transition-all ${cogMemory === false ? 'bg-red-500 text-white border-red-600 shadow-md scale-95' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    ⚠️ 我重述有困難，或者記不起來
                  </button>
                </div>
              </div>

              {/* Orientation Date */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black bg-purple-600 text-white w-7 h-7 flex items-center justify-center rounded-full text-xs">2</span>
                  <h4 className="text-2xl font-black text-slate-800">時間健康認知：請問今天是幾年幾月幾日呢？</h4>
                </div>
                <p className="text-lg text-slate-500 font-bold ml-9">
                  請在下方選單選出「今天的日期」：
                </p>
                <div className="flex flex-wrap items-center gap-4 ml-9 py-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {/* Year Select */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(e.target.value);
                        speak(`選擇年：${e.target.value}`);
                      }}
                      className="text-2xl p-3 border-4 border-purple-200 rounded-2xl font-black bg-white focus:border-purple-600 focus:outline-none"
                    >
                      <option value="">請選擇年</option>
                      {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <span className="text-xl font-bold text-slate-700">年</span>
                  </div>

                  {/* Month Select */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        speak(`選擇月：${e.target.value}`);
                      }}
                      className="text-2xl p-3 border-4 border-purple-200 rounded-2xl font-black bg-white focus:border-purple-600 focus:outline-none"
                    >
                      <option value="">請選擇月</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span className="text-xl font-bold text-slate-700">月</span>
                  </div>

                  {/* Day Select */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedDay}
                      onChange={(e) => {
                        setSelectedDay(e.target.value);
                        speak(`選擇日：${e.target.value}`);
                      }}
                      className="text-2xl p-3 border-4 border-purple-200 rounded-2xl font-black bg-white focus:border-purple-600 focus:outline-none"
                    >
                      <option value="">請選擇日</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <span className="text-xl font-bold text-slate-700">日</span>
                  </div>
                </div>
              </div>

              {/* Orientation Location */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black bg-purple-600 text-white w-7 h-7 flex items-center justify-center rounded-full text-xs">3</span>
                  <h4 className="text-2xl font-black text-slate-800">空間定向認知：請問您現在知道您在哪裡嗎？</h4>
                </div>
                <p className="text-lg text-slate-500 font-bold ml-9">
                  請選擇最符合您目前知道的情況：
                </p>
                <div className="grid grid-cols-2 gap-4 ml-9">
                  <button
                    onClick={() => {
                      setCogOrientLoc(true);
                      speak("好的，您對自己的位置很有定位感。");
                    }}
                    className={`py-4 px-3 rounded-2xl text-xl font-bold border-2 transition-all ${cogOrientLoc === true ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-95' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    😊 我很清楚我在哪裡（如家裡、社區大樓、活動中心、診所等）
                  </button>
                  <button
                    onClick={() => {
                      setCogOrientLoc(false);
                      speak("不打緊，放輕鬆。");
                    }}
                    className={`py-4 px-3 rounded-2xl text-xl font-bold border-2 transition-all ${cogOrientLoc === false ? 'bg-red-500 text-white border-red-600 shadow-md scale-95' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    ❓ 我現在有點想不起來、感到心慌，不確定自己到底在何處
                  </button>
                </div>
              </div>

              {/* Interactive Recall Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black bg-purple-600 text-white w-7 h-7 flex items-center justify-center rounded-full text-xs">4</span>
                  <h4 className="text-2xl font-black text-slate-800">延遲回憶選擇：勾選您還記得的 3 項物品</h4>
                </div>
                <p className="text-lg text-slate-500 font-bold ml-9">
                  請問剛才第一題請您記在腦海裡的 3 個物品是什麼？請在此勾選那 3 個項目（<strong>結果將會在最後總報告告知您</strong>）：
                </p>
                <div className="grid grid-cols-3 gap-3 ml-9">
                  {RECALL_ITEMS.map((item) => {
                    const selected = cogChoices.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => handleChoiceToggle(item)}
                        className={`py-4 px-2 rounded-2xl text-xl font-black border-2 transition-all ${selected ? 'bg-purple-600 text-white border-purple-700 shadow-md scale-95' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                      >
                        {selected ? `✅ ${item}` : item}
                      </button>
                    );
                  })}
                </div>
                {cogChoices.length > 0 && (
                  <div className="ml-9 text-base font-bold text-slate-500 bg-purple-50 p-3 rounded-xl border border-purple-100 inline-block">
                    已選擇：{cogChoices.length} 個物品
                    {cogChoices.length < 3 ? (
                      <span className="text-orange-500 ml-2 font-black">（還要再點選 {3 - cogChoices.length} 個物品喔）</span>
                    ) : (
                      <span className="text-indigo-600 ml-2 font-black">（您已選滿 3 個，請點下方「下一站」按鈕！）</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dom 2: Nutrition */}
          {currentStep === 2 && (
            <div className="space-y-8">
              <div className="bg-amber-50 p-4 rounded-2xl border-l-[6px] border-amber-500 text-amber-900 font-bold">
                💡 評估規則：以下任一結果為「是」即代表初評可能有營養不良風險，需復評！
              </div>

              {/* Weight query */}
              <div className="space-y-3">
                <h4 className="text-2xl font-black text-slate-800">1. 過去三個月，您的體重是否在無意中減輕了 3 公斤以上？</h4>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => {
                      setNutWeight(true);
                      speak("體重減輕三公斤以上。");
                    }}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${nutWeight === true ? 'bg-red-500 text-white border-red-600 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (有此情形)
                  </button>
                  <button
                    onClick={() => {
                      setNutWeight(false);
                      speak("無此情形。");
                    }}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${nutWeight === false ? 'bg-emerald-600 text-white border-emerald-700 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (體重正常)
                  </button>
                </div>
              </div>

              {/* Appetite query */}
              <div className="space-y-3">
                <h4 className="text-2xl font-black text-slate-800">2. 過去三個月，您是否曾經食慾不振（吃得比平常少，胃口變差）？</h4>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => {
                      setNutAppetite(true);
                      speak("食慾不振胃口不佳。");
                    }}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${nutAppetite === true ? 'bg-red-500 text-white border-red-600 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (食慾不佳)
                  </button>
                  <button
                    onClick={() => {
                      setNutAppetite(false);
                      speak("胃口食慾良好。");
                    }}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${nutAppetite === false ? 'bg-emerald-600 text-white border-emerald-700 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (胃口食慾良好)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dom 3: Vision */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div className="bg-emerald-50 p-4 rounded-2xl border-l-[6px] border-emerald-500 text-emerald-900 font-bold">
                💡 評估規則：第二題（視糖尿病判定）結果回答「是」即表示初評有些微視力功能障礙
              </div>

              {/* Q1: Diabetes */}
              <div className="space-y-3">
                <h4 className="text-2xl font-black text-slate-800">1. 您是否罹患糖尿病？</h4>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => {
                      setVisDiabetes(true);
                      setVisEyesight(null); // Clear previous if swapped
                      speak("有糖尿病史。接下來請回答糖尿病專屬眼睛檢查問題。");
                    }}
                    className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visDiabetes === true ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (罹患糖尿病)
                  </button>
                  <button
                    onClick={() => {
                      setVisDiabetes(false);
                      setVisCheckup(null); // Clear previous if swapped
                      speak("無糖尿病。接下來請回答一版眼睛日常生活問題。");
                    }}
                    className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visDiabetes === false ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (無糖尿病)
                  </button>
                </div>
              </div>

              {/* Q2: Conditional Eyesight Q */}
              {visDiabetes === false && (
                <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-200 animate-fadeIn">
                  <h4 className="text-2xl font-black text-slate-800">2. (非糖尿病) 您的眼睛是否有任何問題：看遠方、看近或閱讀上有困難、或有眼睛疾病？</h4>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <button
                      onClick={() => setVisEyesight(true)}
                      className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visEyesight === true ? 'bg-red-500 text-white border-red-600 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                    >
                      是 (有困難或眼疾)
                    </button>
                    <button
                      onClick={() => setVisEyesight(false)}
                      className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visEyesight === false ? 'bg-emerald-600 text-white border-emerald-700 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                    >
                      否 (眼睛視力皆正常)
                    </button>
                  </div>
                </div>
              )}

              {visDiabetes === true && (
                <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-200 animate-fadeIn">
                  <h4 className="text-2xl font-black text-slate-800">2. (糖尿病患) 您過去 1 年是否「未曾」接受過眼睛眼底檢查？</h4>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <button
                      onClick={() => setVisCheckup(true)}
                      className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visCheckup === true ? 'bg-red-500 text-white border-red-600 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                    >
                      是 (未曾做過檢查)
                    </button>
                    <button
                      onClick={() => setVisCheckup(false)}
                      className={`py-5 rounded-2xl text-xl font-black border-2 transition-all ${visCheckup === false ? 'bg-emerald-600 text-white border-emerald-700 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                    >
                      否 (近1年有安排檢查)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dom 4: Depression */}
          {currentStep === 4 && (
            <div className="space-y-8">
              <div className="bg-rose-50 p-4 rounded-2xl border-l-[6px] border-rose-500 text-rose-900 font-bold">
                💡 評估規則：過去兩週如果以下任一情形回答為「是」，則憂鬱情緒初評有問題，需評估關切。
              </div>

              {/* Tired/No hope */}
              <div className="space-y-3">
                <h4 className="text-2xl font-black text-slate-800">1. 過去兩週，您是否常感到厭煩、心煩，或提不起勁、覺得沒有希望？</h4>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => setDepAnnoyed(true)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${depAnnoyed === true ? 'bg-red-500 text-white border-red-600 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (有些氣餒或心煩)
                  </button>
                  <button
                    onClick={() => setDepAnnoyed(false)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${depAnnoyed === false ? 'bg-emerald-600 text-white border-emerald-700 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (心情平穩)
                  </button>
                </div>
              </div>

              {/* Reduced activities */}
              <div className="space-y-3">
                <h4 className="text-2xl font-black text-slate-800">2. 過去兩週，您是否減少了很多原本每天活動和感興趣的事？</h4>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => setDepActivities(true)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${depActivities === true ? 'bg-red-500 text-white border-red-600 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (興趣和活動大減)
                  </button>
                  <button
                    onClick={() => setDepActivities(false)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${depActivities === false ? 'bg-emerald-600 text-white border-emerald-700 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (仍然保持常規活動)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dom 5: Hearing */}
          {currentStep === 5 && (
            <div className="space-y-8">
              <div className="bg-pink-50 p-4 rounded-2xl border-l-[6px] border-pink-500 text-pink-900 font-bold">
                💡 評估規則：請聽語音播放。本健康評估由您本人填答，請依照真實情況點選。
              </div>

              <div className="space-y-4">
                <h4 className="text-2xl font-black text-slate-800">聽讀與語音大聲重複測試</h4>
                <p className="text-lg text-slate-500 font-bold leading-relaxed">
                  請點下方播放語音按鈕，系統會大聲唸出三個數字，請聽了之後試著大聲重複念出一遍：
                </p>
                
                <div className="flex justify-center py-4">
                  <button
                    onClick={() => speak("六、一、九")}
                    className="flex items-center gap-3 px-8 py-4 bg-pink-100 hover:bg-pink-200 border-2 border-pink-300 text-pink-900 rounded-full font-black text-xl transition-all shadow-md active:scale-95"
                  >
                    <Volume2 className="w-6 h-6 animate-pulse" />
                    <span>🔊 點我大聲播放三個數字 (6, 1, 9)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => setHearRepeat(true)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${hearRepeat === true ? 'bg-emerald-600 text-white border-emerald-700 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    👍 我有聽清，並且能正確重複唸出 6、1、9
                  </button>
                  <button
                    onClick={() => setHearRepeat(false)}
                    className={`py-6 rounded-2xl text-2xl font-black border-2 transition-all ${hearRepeat === false ? 'bg-red-500 text-white border-red-600 scale-95 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    ⚠️ 我聽不清楚、有遺漏或重複不出來
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dom 6: Medicine */}
          {currentStep === 6 && (
            <div className="space-y-8">
              <div className="bg-teal-50 p-4 rounded-2xl border-l-[6px] border-teal-500 text-teal-900 font-bold">
                💡 評估規則：以下用藥安全初評，任何一題回答「是」，即為用藥安全風險的高危險群。
              </div>

              {/* Med count */}
              <div className="space-y-3">
                <h4 className="text-xl font-black text-slate-800">1. 您每天使用的藥物是否在 10 種 (含) 以上？（註：中藥或保健品等合併算為1種藥物）</h4>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setMedCount(true)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medCount === true ? 'bg-red-500 text-white border-red-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (達10種以上)
                  </button>
                  <button
                    onClick={() => setMedCount(false)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medCount === false ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (10種以下)
                  </button>
                </div>
              </div>

              {/* Med types */}
              <div className="space-y-3">
                <h4 className="text-xl font-black text-slate-800">2. 您服用的藥品中是否包含經常服用的止痛藥、安眠藥或睡眠輔助藥物等？</h4>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setMedTypes(true)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medTypes === true ? 'bg-red-500 text-white border-red-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (包含止痛或安眠藥物)
                  </button>
                  <button
                    onClick={() => setMedTypes(false)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medTypes === false ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (其餘常規藥物)
                  </button>
                </div>
              </div>

              {/* Side effects */}
              <div className="space-y-3">
                <h4 className="text-xl font-black text-slate-800">3. 您是否因為服用任何藥物，而經常發生平衡感改變、眩暈、睏倦、低血壓或口乾舌燥等副作用？</h4>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setMedSideEffects(true)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medSideEffects === true ? 'bg-red-500 text-white border-red-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    是 (有副作用或平衡受損)
                  </button>
                  <button
                    onClick={() => setMedSideEffects(false)}
                    className={`py-4 rounded-xl text-lg font-bold border-2 transition-all ${medSideEffects === false ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    否 (很少或無副作用反應)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dom 7: Mobility */}
          {currentStep === 7 && (
            <div className="space-y-8">
              <div className="bg-blue-50 p-4 rounded-2xl border-l-[6px] border-blue-500 text-blue-900 font-bold">
                💡 評估規則：系統自動介接先前完成的「5次椅子崛起起立坐下測試」成績。超過 <strong>12秒</strong> 即為行動功能高風險群，需注意復審！
              </div>

              <div className="space-y-4">
                <h4 className="text-2xl font-black text-slate-800">五次椅子起身測試（時間計時）</h4>
                
                {autoLoadedTime !== null ? (
                  <div className="p-6 bg-emerald-50 border-4 border-emerald-200 rounded-3xl flex items-center justify-between shadow-inner">
                    <div className="space-y-1">
                      <p className="text-xl font-extrabold text-emerald-800">✅ 成功帶入物理測驗成績！</p>
                      <p className="text-base text-slate-500 font-bold">檢測日期與目前測試相應</p>
                    </div>
                    <div className="text-right">
                      <span className="text-5xl font-black text-emerald-700">{autoLoadedTime.toFixed(1)}</span>
                      <span className="text-xl font-bold ml-1 text-slate-500">秒</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-amber-50 border-4 border-amber-200 rounded-3xl flex flex-col gap-3 shadow-inner">
                    <p className="text-xl font-extrabold text-amber-800">⚠️ 查無目前使用者最近的椅子起立坐下測試紀錄</p>
                    <p className="text-base text-slate-600 font-bold">
                      您可以手動在下方輸入秒數（例如：13.5秒），或者由施測者在旁邊計時輸入。
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col gap-4">
                  <label className="text-lg font-black text-slate-700">修正/手動輸入秒數 (秒)：</label>
                  <div className="flex gap-4 items-center">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="請輸入起立 5 次代表秒數"
                      value={mobChairTime}
                      onChange={(e) => {
                        setMobChairTime(e.target.value);
                        setTouchedChairTime(true);
                      }}
                      className="w-full text-4xl p-4 rounded-2xl border-4 border-slate-200 text-center font-black focus:border-indigo-600 focus:outline-none"
                    />
                    <span className="text-2xl font-black text-slate-500">秒</span>
                  </div>
                  {touchedChairTime && autoLoadedTime !== null && (
                    <button
                      onClick={() => {
                        setMobChairTime(autoLoadedTime.toFixed(1));
                        setTouchedChairTime(false);
                      }}
                      className="text-indigo-600 font-extrabold text-base self-end hover:underline"
                    >
                      🔄 回復成原本帶入的 {autoLoadedTime.toFixed(1)} 秒
                    </button>
                  )}
                </div>

                {mobChairTime && (
                  <div className="p-4 rounded-2xl border-2 flex items-center gap-3 font-extrabold">
                    {parseFloat(mobChairTime) > 12 ? (
                      <div className="text-red-600 bg-red-50 border-red-200 p-3 rounded-xl w-full flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>超過 12 秒：初評有高風險問題。建議接受行動和肌不全整合復查</span>
                      </div>
                    ) : parseFloat(mobChairTime) === 0 ? (
                      <div className="text-orange-500 bg-orange-50 border-orange-200 p-3 rounded-xl w-full flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>時間不可為 0。請輸入正確的時間數據。</span>
                      </div>
                    ) : (
                      <div className="text-emerald-700 bg-emerald-50 border-emerald-200 p-3 rounded-xl w-full flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        <span>低於 12 秒內正常：行動能力狀態尚屬良好。</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dom 8: Report / Detailed Summary */}
          {currentStep === 8 && (
            <div className="space-y-6">
                <div className="text-center space-y-2 mb-6">
                  <span className="text-4xl">📊</span>
                  <h4 className="text-3xl font-black text-slate-800">WHO ICOPE 篩選初評報告</h4>
                  <p className="text-base text-slate-500 font-bold">
                    受試長者：{user.displayName} (年齡：{user.age} 歲) ｜ 評估日期：{new Date().toLocaleDateString('zh-TW')}
                  </p>
                </div>

                {/* Summary Badges Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* 1. Cognitive */}
                  <div className={`p-5 rounded-3xl border-4 flex flex-col justify-between min-h-[160px] shadow-sm ${getDomainResults().cognitive ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                    <div className="space-y-2 w-full">
                      <div className="flex justify-between items-start">
                        <p className="text-lg font-black flex items-center gap-2">
                          <Brain className="w-5 h-5 flex-shrink-0" />
                          一、認知功能
                        </p>
                        <span className="text-sm font-black px-3 py-1 rounded-full border text-slate-800" style={{ backgroundColor: getDomainResults().cognitive ? '#fee2e2' : '#d1fae5', borderColor: getDomainResults().cognitive ? '#fca5a5' : '#86efac' }}>
                          {getDomainResults().cognitive ? '建議複評' : '正常過關'}
                        </span>
                      </div>
                      
                      {/* Detailed answers breakdown for direct feedback to elder */}
                      <div className="text-sm space-y-1 font-bold bg-white/60 p-3 rounded-2xl border border-slate-100 mt-2 text-slate-800">
                        <p className="flex justify-between">
                          <span>❶ 記憶認讀認字：</span>
                          <span className={cogMemory ? "text-emerald-700 font-extrabold" : "text-red-600 font-extrabold"}>{cogMemory ? '✅ 記住' : '❌ 有困難'}</span>
                        </p>
                        <p className="flex justify-between">
                          <span>❷ 今天日期定向：</span>
                          <span className={isDateCorrect ? "text-emerald-700 font-extrabold" : "text-red-900 font-extrabold"}>
                            {isDateCorrect ? '✅ 答對' : '❌ 答錯'} ({selectedYear}年{selectedMonth}月{selectedDay}日)
                          </span>
                        </p>
                        {!isDateCorrect && (
                          <p className="text-xs text-red-500 text-right">
                            實際應為：{today.getFullYear()}年{today.getMonth() + 1}月{today.getDate()}日
                          </p>
                        )}
                        <p className="flex justify-between">
                          <span>❸ 空間感覺定位：</span>
                          <span className={cogOrientLoc ? "text-emerald-700 font-extrabold" : "text-red-600"}>{cogOrientLoc ? '✅ 定位清楚' : '❌ 限於疑惑'}</span>
                        </p>
                        <p className="flex justify-between">
                          <span>❹ 延遲 recall 記憶：</span>
                          <span className={hasAllThreeChoices ? "text-emerald-700 font-extrabold" : "text-red-600 font-extrabold"}>
                            {hasAllThreeChoices ? '✅ 正確' : '❌ 有遺漏'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 pt-1 leading-normal border-t border-slate-200 mt-1">
                          您選擇：{cogChoices.length > 0 ? cogChoices.join('、') : '無拼湊'} ；正確應為：鉛筆、汽車、書。
                        </p>
                      </div>
                    </div>
                  </div>

                {/* 2. Nutrition */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().nutrition ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Apple className="w-5 h-5" />
                      二、營養狀態
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {getDomainResults().nutrition ? '❌ 過去三個月有食慾減退或體重減輕達 3公斤以上' : '✅ 正常：近期無體重驟降且胃口正常'}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().nutrition ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().nutrition ? '需復評' : '正常'}
                  </span>
                </div>

                {/* 3. Vision */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().vision ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      三、視力健康
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {getDomainResults().vision ? (
                        visDiabetes ? '❌ 糖尿病患者已超過 1 年未接受眼底醫學光譜檢查' : '❌ 日常存在讀寫、遠近看物眼疾障礙問題'
                      ) : '✅ 正常：定期做眼底鏡檢（糖尿病者）或自覺日常視力良好'}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().vision ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().vision ? '需復評' : '正常'}
                  </span>
                </div>

                {/* 4. Depression */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().depression ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Smile className="w-5 h-5" />
                      四、情緒憂鬱
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {getDomainResults().depression ? '❌ 近兩週有感到心煩/無奈，或是原生活習慣顯著退隱' : '✅ 正常：無明顯倦怠感或活動驟減'}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().depression ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().depression ? '需復評' : '正常'}
                  </span>
                </div>

                {/* 5. Hearing */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().hearing ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Ear className="w-5 h-5" />
                      五、聽力測試
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {getDomainResults().hearing ? '❌ 語音三位數字 (6、1、9) 不能全部正確複誦' : '✅ 正常：聽辨語音重述成功'}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().hearing ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().hearing ? '需復評' : '正常'}
                  </span>
                </div>

                {/* 6. Medication */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().medicine ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Pill className="w-5 h-5" />
                      六、用藥安全
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {getDomainResults().medicine ? '❌ 合併多重用藥達10種、或服用止痛安眠藥或自覺明顯頭暈副作用' : '✅ 正常：合適用藥管理，無顯著副作用狀態'}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().medicine ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().medicine ? '需復評' : '正常'}
                  </span>
                </div>

                {/* 7. Mobility */}
                <div className={`p-5 rounded-3xl border-4 flex items-start justify-between min-h-[120px] shadow-sm ${getDomainResults().mobility ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <div className="space-y-1">
                    <p className="text-lg font-black flex items-center gap-2">
                      <Accessibility className="w-5 h-5" />
                      七、行動功能
                    </p>
                    <p className="text-sm opacity-80 font-bold">
                      {parseFloat(mobChairTime) > 12 ? (
                        `❌ 椅子起身 5 次平均時間達 ${mobChairTime} 秒 (已超過 12 秒之高風險值)`
                      ) : parseFloat(mobChairTime) === 0 ? (
                        '❌ 時間數據無效'
                      ) : (
                        `✅ 正常：起立 5 次耗時 ${mobChairTime} 秒在 12 秒上限標準內`
                      )}
                    </p>
                  </div>
                  <span className="text-base font-black px-3 py-1 rounded-full uppercase" style={{ backgroundColor: getDomainResults().mobility ? '#fee2e2' : '#d1fae5' }}>
                    {getDomainResults().mobility ? '需復評' : '正常'}
                  </span>
                </div>

              </div>
              
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl text-slate-700 leading-relaxed font-bold text-base mt-2">
                🚩 <strong>複評及衛教指引：</strong>
                {
                  Object.values(getDomainResults()).filter(Boolean).length > 0 ? (
                    <span> 經初步評估有項目落入「需復評」區（標示紅色）。建議後續由醫事人員協同復診、調整用藥安全，並搭配日常核心肌群及心肺體能遊戲。</span>
                  ) : (
                    <span> 受試長者在認知、營養、聽力視力及用藥行動上表現全面優良。請保持均衡飲食及體健運動。</span>
                  )
                }
              </div>

              <div className="py-2 flex justify-center gap-4">
                <button
                  onClick={handleSaveReport}
                  className="px-12 py-5 bg-indigo-600 text-white text-2xl font-black rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all text-center border-b-8 border-indigo-900"
                >
                  💾 儲存高齡 ICOPE 評估結果並記錄
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Wizard Footer Navigation Controls */}
        {currentStep > 0 && currentStep < 8 && (
          <div className="mt-8 pt-6 border-t-[4px] border-slate-100 flex justify-between items-center bg-white z-10">
            <button
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-lg transition flex items-center gap-2 border border-slate-300 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>上一站</span>
            </button>

            <div className="text-base font-black text-slate-400">
              第 {currentStep} / {DOMAINS.length - 2} 步
            </div>

            <button
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={isNextDisabled()}
              className={`px-8 py-4 text-white text-xl font-black rounded-3xl transition flex items-center gap-2 border-b-4 duration-150 ${isNextDisabled() ? 'bg-slate-300 border-slate-400 cursor-not-allowed opacity-50' : 'bg-indigo-600 border-indigo-800 hover:bg-indigo-700 active:scale-95'}`}
            >
              <span>{currentStep === 7 ? '產生報告' : '下一站'}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Helpful Legend Card on non-report page */}
      {currentStep > 0 && currentStep < 8 && (
        <div className="bg-indigo-50 border-2 border-indigo-100 p-6 rounded-[30px] flex items-start gap-4 shadow-sm">
          <HelpCircle className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-1" />
          <div className="text-sm font-bold text-indigo-900 leading-relaxed gap-1 flex flex-col">
            <p><strong>🤔 如何施測？</strong> 施測者可手持平板，站在長者身邊引導高齡受試官。或在大字型中，長者可同步互動答題。</p>
            <p><strong>🔊 語音朗讀：</strong> 點選標題右側的 🔊 符號能使系統為視力退化的長者朗讀題目！</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default IcopeSurveyView;
