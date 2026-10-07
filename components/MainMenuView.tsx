import React from 'react';
import { UserProfile } from '../types';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  user: UserProfile;
  onSelect: (choice: 'test' | 'survey' | 'game' | 'history') => void;
  onLogout: () => void;
}

const MainMenuView: React.FC<Props> = ({ user, onSelect, onLogout }) => {
  const menuItems = [
    { id: 'test', label: '體能測驗', icon: '🏃', color: 'bg-blue-500', desc: 'SPPB 專業評估' },
    { id: 'survey', label: '健康問卷', icon: '📝', color: 'bg-green-500', desc: '生活習慣調查' },
    { id: 'game', label: '運動遊戲', icon: '🎮', color: 'bg-purple-500', desc: '趣味肌力訓練' },
    { id: 'history', label: '歷史紀錄', icon: '📊', color: 'bg-orange-500', desc: '追蹤進步狀況' },
  ];

  // SQL Upload and User Sync operations are now handled in the global top AccessibilityBar

  const handleExportBackup = () => {
    try {
      const data = {
        app: 'Vivifrail體能測試系統Pro_ClinicBackup',
        version: '1.0',
        exportedAt: Date.now(),
        users: LocalDbService.getUsers(),
        history: LocalDbService.getHistory()
      };
      
      const fileContent = JSON.stringify(data, null, 2);
      const blob = new Blob([fileContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', `Vivifrail_ClinicBackup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance("備份資料完成，請妥善保管下載之 JSON 備份檔。");
        utterance.lang = "zh-TW";
        window.speechSynthesis.speak(utterance);
      }
    } catch (err: any) {
      alert("備份失敗：" + err.message);
    }
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backupData = JSON.parse(content);

        if (!backupData.users || !backupData.history) {
          throw new Error('不合法的備份檔案結構格式，請上傳正確的 Vivifrail 診間備份檔案 (.json)');
        }

        await LocalDbService.importBackup(backupData);
        
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance("備份資料已順利還原合併！您可以至歷史紀錄或測試中查看您的更新結果。");
          utterance.lang = "zh-TW";
          window.speechSynthesis.speak(utterance);
        }
        alert(`🎉 還原成功！已成功合併還原系統數據 (目前共有 ${LocalDbService.getUsers().length} 位受測者帳號、${LocalDbService.getHistory().length} 筆歷史評估與復健紀錄)`);
        window.location.reload(); // Reload to refresh local caches everywhere nicely
      } catch (err: any) {
        alert("還原失敗：" + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-[30px] shadow-lg border-4 border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl">
            👴
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">{user.displayName}</h2>
            <p className="text-slate-500 font-bold">歡迎回來，今天也要加油！</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-red-50 hover:text-red-500 transition"
        >
          登出
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id as any)}
            className="group relative overflow-hidden bg-white p-8 rounded-[40px] border-4 border-slate-100 shadow-xl hover:border-blue-500 transition-all active:scale-95 text-left"
          >
            <div className={`w-20 h-20 ${item.color} rounded-[25px] flex items-center justify-center text-5xl mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
              {item.icon}
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-2">{item.label}</h3>
            <p className="text-xl font-bold text-slate-400">{item.desc}</p>
            <div className="absolute top-8 right-8 text-slate-100 group-hover:text-blue-100 transition-colors">
              <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* --- CLINICAL DATA LOCAL FILE BACKUP AND RECOVERY --- */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-4 border-indigo-100 p-8 rounded-[40px] shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center border-b border-indigo-100 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">💾</span>
            <div>
              <h4 className="text-2xl font-black text-slate-800">診間資料本地備份與還原</h4>
              <p className="text-slate-500 font-bold text-base">將受測長輩的登入名冊與完整的歷史評估數據儲存為本地備份檔案。</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            type="button"
            onClick={handleExportBackup}
            className="flex items-center justify-center gap-3 p-5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-lg rounded-2xl shadow-md transition cursor-pointer"
            title="將名單和歷史紀錄下載為 .json 檔案備份"
          >
            <span className="text-2xl">📤</span>
            <span>下載本地數據備份檔</span>
          </button>

          <label className="flex items-center justify-center gap-3 p-5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-lg rounded-2xl shadow-md transition cursor-pointer text-center">
            <span className="text-2xl">📥</span>
            <span>還原合併備份資料</span>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportBackup} 
              className="hidden" 
            />
          </label>
        </div>

        {/* Informative banner explaining where SQL Sync is located */}
        <div className="p-5 bg-white border-2 border-indigo-100 rounded-3xl flex items-start gap-3.5 shadow-sm">
          <span className="text-2xl mt-0.5">💡</span>
          <div className="space-y-1">
            <h5 className="font-black text-slate-800 text-lg">外部資料庫 SQL 實時同步中心：</h5>
            <p className="text-slate-500 font-bold text-sm leading-relaxed">
              因應隨時隨地、甚至在登入前進行同步之安全考量，『🚀 有網上傳 SQL』 與 『🔄 同步本地登入資料』 按鈕現已整合在網頁最頂端的<b>「全域輔助工具列」</b>（字級調整與高對比旁）。您在任何頁面（包含尚未登入時）均可直接點選進行實時資料對接！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenuView;
