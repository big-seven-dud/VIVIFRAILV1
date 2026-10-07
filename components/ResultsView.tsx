
import React from 'react';
import { TestResult, UserSettings, UserProfile } from '../types';
import * as XLSX from 'xlsx';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from 'recharts';

interface Props {
  results: TestResult;
  user: UserProfile;
  onReset: () => void;
  speak: (t: string) => void;
  settings: UserSettings;
  saveError: string | null;
  isSyncing: boolean;
}

const ResultsView: React.FC<Props> = ({ results, user, onReset, speak, settings, saveError, isSyncing }) => {
  const totalScore = results.balanceScore + results.walkScore + results.chairScore;

  const getSppbLevel = (score: number, walk6mTime: number) => {
    const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
    
    // A Grade
    if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) {
      return { id: 'A', label: "失能者", color: "text-red-600", border: "border-red-600", advice: "您的體能狀況較為虛弱。建議尋求物理治療師或醫師的評估，制定個人化的復健計畫，並注意居家環境安全。" };
    }
    // B Grade
    if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) {
      return { id: 'B', label: "衰弱者", color: "text-orange-600", border: "border-orange-600", advice: "您的體能已有明顯衰弱跡象。建議在專業人員指導下進行復健運動，重點加強下肢肌力與平衡感，降低跌倒風險。" };
    }
    // C Grade
    if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) {
      return { id: 'C', label: "衰弱前期者", color: "text-blue-600", border: "border-blue-600", advice: "您的體能處於衰弱前期。建議開始增加日常活動量，並加入簡單的平衡與肌力訓練，預防進一步衰退。" };
    }
    // D Grade
    return { id: 'D', label: "健康者", color: "text-green-600", border: "border-green-600", advice: "您的體能狀況良好！建議繼續維持規律的運動習慣，包含有氧運動與適度的肌力訓練，以保持身體機能。" };
  };

  const level = getSppbLevel(totalScore, results.rawWalk6mTime);
  const fallRiskMark = (results.fallRisk?.hasRisk || results.rawTugTime > 20 || results.rawWalk6mTime > 7.5) ? "+" : "";

  const radarData = [
    { subject: '平衡能力', A: (results.balanceScore/4)*100, full: 100 },
    { subject: '步行速度', A: (results.walkScore/4)*100, full: 100 },
    { subject: '肌力爆發', A: (results.chairScore/4)*100, full: 100 },
    { subject: '起立行走', A: results.rawTugTime > 0 ? Math.max(0, 100 - (results.rawTugTime - 10) * 5) : 50, full: 100 },
    { subject: '6m耐力', A: results.rawWalk6mTime > 0 ? Math.max(0, 100 - (results.rawWalk6mTime - 5) * 10) : 50, full: 100 },
  ];

  const exportToExcel = () => {
    const data = [
      ["Vivifrail SPPB 體能評估報告"],
      ["受測者", user.displayName],
      ["電子郵件", user.email],
      ["日期", new Date().toLocaleString()],
      [""],
      ["跌倒風險 (Vivifrail +)", results.fallRisk?.hasRisk ? "有跌倒風險 (+)" : "低跌倒風險"],
      [""],
      ["測試項目", "得分 (0-4)", "原始數據 (秒)"],
      ["平衡力測試 (總分)", results.balanceScore, "-"],
      ["- 雙腳並排站立", "", results.rawBalanceSideBySide > 0 ? results.rawBalanceSideBySide.toFixed(2) : "未執行/0"],
      ["- 雙腳半並排站立", "", results.rawBalanceSemiTandem > 0 ? results.rawBalanceSemiTandem.toFixed(2) : "未執行/0"],
      ["- 雙腳直線站立", "", results.rawBalanceTandem > 0 ? results.rawBalanceTandem.toFixed(2) : "未執行/0"],
      ["步行速度測試 (趟1)", "-", results.walkTrial1 > 0 ? results.walkTrial1.toFixed(2) : "未執行"],
      ["步行速度測試 (趟2)", "-", results.walkTrial2 > 0 ? results.walkTrial2.toFixed(2) : "未執行"],
      ["步行速度測試 (最佳)", results.walkScore, results.rawWalkTime.toFixed(2)],
      ["起坐能力測試", results.chairScore, results.rawChairTime.toFixed(2)],
      ["起立行走測試 (TUG)", "-", results.rawTugTime > 0 ? results.rawTugTime.toFixed(2) : "未執行"],
      ["6公尺步行測試", "-", results.rawWalk6mTime > 0 ? results.rawWalk6mTime.toFixed(2) : "未執行"],
      [""],
      ["總分", totalScore, "/ 12"],
      ["分級", `${level.id} 級 (${level.label})`],
      ["醫師建議", level.advice],
      [""],
      ["--- 五角雷達能力分析數據 (0-100%) ---"],
      ["平衡能力 (%)", (results.balanceScore/4)*100],
      ["步行速度 (%)", (results.walkScore/4)*100],
      ["起坐能力 (%)", (results.chairScore/4)*100],
      ["敏捷反應 (%)", 80],
      ["核心穩定 (%)", 75],
      [""],
      ["--- 起坐詳細數據 (Repetition Details) ---"],
      ["次序", "耗時 (秒)", "時間戳記"],
      ...(results.chairReps?.map(rep => [`第 ${rep.id} 下`, rep.duration.toFixed(2), new Date(rep.timestamp).toLocaleTimeString()]) || [["無詳細數據"]])
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SPPB Results");
    
    const filename = `SPPB_Report_${user.displayName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    speak("報表已導出。");
  };

  const dataStatus = saveError ? "數據同步失敗" : "測驗數據已同步至雲端紀錄";

  React.useEffect(() => {
    const riskText = results.fallRisk?.hasRisk ? " 且有跌倒風險 (+)" : "";
    speak(`測試完成。您的體能總分為 ${totalScore} 分。屬於 ${level.id} 級 ${level.label}${riskText}。${level.advice}`);
  }, []);

  return (
    <div className="flex flex-col space-y-8 py-6 pb-20">
      <div className="bg-white p-6 rounded-[30px] shadow-lg border-4 border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">👤</div>
          <div>
            <p className="text-slate-500 font-bold text-sm">受測者資訊</p>
            <p className="text-xl font-black text-slate-800">{user.displayName} ({user.email})</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 ${
            isSyncing 
              ? 'text-yellow-600 bg-yellow-50 border-yellow-100 animate-pulse' 
              : saveError 
                ? 'text-red-600 bg-red-50 border-red-100' 
                : 'text-green-600 bg-green-50 border-green-100'
          }`}>
             {isSyncing ? (
               <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
             ) : (
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                 <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
               </svg>
             )}
             <span className="font-bold text-sm">
               {isSyncing ? "同步中" : (saveError ? "同步失敗" : "已儲存")}
             </span>
          </div>
          {results.fallRisk?.hasRisk && (
            <div className="bg-red-100 text-red-600 px-4 py-2 rounded-2xl font-black text-xl border-2 border-red-200">
               風險 +
            </div>
          )}
        </div>
      </div>

      <div className={`p-10 rounded-[50px] shadow-2xl border-4 ${settings.highContrast ? 'border-yellow-400 bg-black' : 'bg-white border-blue-500'}`}>
        <h2 className={`text-6xl font-black mb-4 ${level.color}`}>
          等級 {level.id}{fallRiskMark}
          <span className="text-2xl ml-4 opacity-70">({level.label})</span>
        </h2>
        <p className={`text-3xl leading-relaxed font-bold ${settings.highContrast ? 'text-yellow-400' : 'text-slate-700'}`}>
          {level.advice}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col space-y-4">
          {[
            { l: "平衡力測試 (0-4)", v: results.balanceScore, 
              details: [
                { name: "並排", val: results.rawBalanceSideBySide },
                { name: "半並排", val: results.rawBalanceSemiTandem },
                { name: "直線", val: results.rawBalanceTandem }
              ],
              color: "text-blue-600" 
            },
            { l: "步行速度 (0-4)", v: results.walkScore, t: results.rawWalkTime, color: "text-green-600" },
            { l: "起坐能力 (0-4)", v: results.chairScore, t: results.rawChairTime, color: "text-purple-600" },
            { l: "起立行走 (TUG)", v: results.rawTugTime > 0 ? (results.rawTugTime > 20 ? "風險" : "正常") : "-", t: results.rawTugTime, color: "text-orange-600" },
            { l: "6m步行測試", v: results.rawWalk6mTime > 0 ? (results.rawWalk6mTime > 7.5 ? "風險" : "正常") : "-", t: results.rawWalk6mTime, color: "text-cyan-600" },
          ].map((item, i) => (
            <div key={i} className="p-8 rounded-[32px] border-4 border-slate-100 bg-slate-50 flex flex-col space-y-4">
              <div className="flex justify-between items-center w-full">
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-slate-500">{item.l}</span>
                  {item.t !== undefined && item.t > 0 && <span className="text-lg font-bold text-slate-400">耗時 {item.t.toFixed(1)} 秒</span>}
                </div>
                <span className={`text-5xl font-black ${item.color}`}>{item.v} <span className="text-2xl">分</span></span>
              </div>
              
              {item.details && (
                <div className="flex gap-2 flex-wrap">
                  {item.details.map((d, index) => (
                    <div key={index} className="px-4 py-2 bg-white rounded-xl border-2 border-slate-200 flex flex-col items-center min-w-[80px]">
                      <span className="text-xs font-bold text-slate-400">{d.name}</span>
                      <span className="text-lg font-black text-slate-700">{d.val.toFixed(1)}s</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="p-8 rounded-[32px] border-4 border-blue-600 bg-blue-50 flex justify-between items-center h-full">
            <span className="text-3xl font-black text-blue-800">SPPB 總分</span>
            <span className="text-6xl font-black text-blue-700">{totalScore} <span className="text-2xl">/ 12</span></span>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[50px] shadow-2xl border-4 border-slate-100 flex flex-col items-center">
          <h3 className="text-2xl font-black text-slate-800 mb-4 self-start">能力分析五角圖</h3>
          <div className="w-full h-full min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                 <PolarGrid />
                 <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 14, fontWeight: 'bold' }} />
                 <PolarRadiusAxis angle={30} domain={[0, 100]} />
                 <Radar 
                   name="能力分析" 
                   dataKey="A" 
                   stroke="#2563eb" 
                   fill="#3b82f6" 
                   fillOpacity={0.6} 
                 />
               </RadarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-4">
        <button 
          onClick={exportToExcel}
          className="w-full py-8 bg-green-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition flex items-center justify-center space-x-4"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>導出 Excel 報表</span>
        </button>
        <button 
          onClick={onReset}
          className="w-full py-8 bg-slate-900 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition"
        >
          回首頁重新檢測
        </button>
      </div>
    </div>
  );
};

export default ResultsView;
