import React, { useState } from 'react';
import { UserSettings, UserProfile } from '../types';
import { LocalDbService } from '../src/lib/LocalStorageService';

interface Props {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
  currentUser?: UserProfile | null;
}

const AccessibilityBar: React.FC<Props> = ({ settings, setSettings, currentUser }) => {
  // --- Remote SQL Synchronizer & Local Backup States ---
  const [showSqlUploadModal, setShowSqlUploadModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string>(
    localStorage.getItem('vivifrail_remote_sql_url') || 'http://127.0.0.1:8000/api/sppb_sync'
  );
  
  // 記錄最後同步時間與已同步筆數
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return localStorage.getItem('vivifrail_last_sync_time') || '';
  });
  const [lastSyncedCount, setLastSyncedCount] = useState<number>(() => {
    const saved = localStorage.getItem('vivifrail_last_synced_count');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lastSyncStatus, setLastSyncStatus] = useState<'idle' | 'success' | 'error'>(() => {
    return (localStorage.getItem('vivifrail_last_sync_status') as any) || 'idle';
  });

  // 進階設定展開狀態
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState<string>('');
  const [sqlScript, setSqlScript] = useState<string>('');

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMsg, setSyncMsg] = useState<string>('');
  const [manualUsersJson, setManualUsersJson] = useState<string>('');

  const generateAllUsersSqlScript = (dataArray: any[], currentU: UserProfile | null) => {
    let sql = `-- =========================================================\n`;
    sql += `-- VIVIFRAIL SPPB CLINICAL COGNITIVE RECORD & ACCOUNT DATABASE BATCH EXPORT\n`;
    sql += `-- Generated: ${new Date().toLocaleString()}\n`;
    sql += `-- Total Profiles Count: ${LocalDbService.getUsers().length}\n`;
    sql += `-- Total Records Count: ${dataArray.length}\n`;
    sql += `-- =========================================================\n\n`;

    // 1. Create Sppb Users Table Schema
    sql += `-- [1/2] ELDERS / SUBJECTS PROFILE TABLE\n`;
    sql += `CREATE TABLE IF NOT EXISTS sppb_users (\n`;
    sql += `  uid VARCHAR(128) PRIMARY KEY,\n`;
    sql += `  display_name VARCHAR(256) NOT NULL,\n`;
    sql += `  email VARCHAR(256) NOT NULL UNIQUE,\n`;
    sql += `  age INT,\n`;
    sql += `  gender VARCHAR(32),\n`;
    sql += `  height FLOAT,\n`;
    sql += `  weight FLOAT,\n`;
    sql += `  created_at BIGINT\n`;
    sql += `);\n\n`;

    // 2. Create Sppb Records Table Schema
    sql += `-- [2/2] EVALUATION & EXERCISE PERFORMANCE RECORDS TABLE\n`;
    sql += `CREATE TABLE IF NOT EXISTS sppb_records (\n`;
    sql += `  id SERIAL PRIMARY KEY,\n`;
    sql += `  user_uid VARCHAR(128) NOT NULL,\n`;
    sql += `  record_type VARCHAR(64) NOT NULL,\n`;
    sql += `  record_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n`;
    sql += `  total_score INT NOT NULL,\n`;
    sql += `  balance_score INT NOT NULL,\n`;
    sql += `  walk_score INT NOT NULL,\n`;
    sql += `  chair_score INT NOT NULL,\n`;
    sql += `  raw_walk_time FLOAT,\n`;
    sql += `  raw_chair_time FLOAT,\n`;
    sql += `  raw_balance_side_by_side FLOAT,\n`;
    sql += `  raw_balance_semi_tandem FLOAT,\n`;
    sql += `  raw_balance_tandem FLOAT,\n`;
    sql += `  additional_details TEXT,\n`;
    sql += `  created_at BIGINT NOT NULL,\n`;
    sql += `  FOREIGN KEY (user_uid) REFERENCES sppb_users(uid) ON DELETE CASCADE\n`;
    sql += `);\n\n`;

    // 3. Write User Registrations
    sql += `-- =========================================================\n`;
    sql += `-- INSERTING REGISTERED ELDERS ACCOUNT IDENTITIES\n`;
    sql += `-- =========================================================\n`;
    
    const usersList = LocalDbService.getUsers();
    const finalUsers = usersList.length > 0 ? usersList : (currentU ? [currentU] : []);
    const uniqueUids = new Set<string>();

    finalUsers.forEach(u => {
      if (uniqueUids.has(u.uid)) return;
      uniqueUids.add(u.uid);

      const safeName = (u.displayName || '未知受測者').replace(/'/g, "''");
      const safeEmail = (u.email || `${u.uid}@vivifrail.local`).replace(/'/g, "''");
      const gender = u.gender || 'unknown';
      const age = u.age || 0;
      const height = u.height || 0;
      const weight = u.weight || 0;
      const uid = u.uid || 'unknown_uid';
      const createdTs = Date.now();

      sql += `INSERT INTO sppb_users (uid, display_name, email, age, gender, height, weight, created_at) \n`;
      sql += `VALUES ('${uid}', '${safeName}', '${safeEmail}', ${age}, '${gender}', ${height}, ${weight}, ${createdTs})\n`;
      sql += `ON CONFLICT (uid) DO UPDATE SET display_name='${safeName}', age=${age}, height=${height}, weight=${weight};\n`;
    });
    sql += `\n`;

    // 4. Write Records
    sql += `-- =========================================================\n`;
    sql += `-- INSERTING EVALUATION & GAME EXERCISE HISTORY RECORDS\n`;
    sql += `-- =========================================================\n`;
    
    dataArray.forEach(record => {
      const u = record.user || currentU || { uid: 'unknown_uid', displayName: '未知受測者', email: 'unknown@example.com' };
      const ts = record.timestamp || Date.now();
      const dateStr = new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
      const mode = record.mode || record.gameType || 'sppb';
      
      const details = record.details || {};
      const balance = details.balanceScore ?? (record.balanceScore ?? 0);
      const walk = details.walkScore ?? (record.walkScore ?? 0);
      const chair = details.chairScore ?? (record.chairScore ?? 0);
      const total = record.score !== undefined ? record.score : (balance + walk + chair);

      const rawWalk = details.rawWalkTime || details.rawWalk6mTime || record.rawWalkTime || record.rawWalk6mTime || 0;
      const rawChair = details.rawChairTime || record.rawChairTime || 0;
      const sByS = details.rawBalanceSideBySide || record.rawBalanceSideBySide || 0;
      const semiT = details.rawBalanceSemiTandem || record.rawBalanceSemiTandem || 0;
      const tandem = details.rawBalanceTandem || record.rawBalanceTandem || 0;

      const uid = u.uid || 'unknown_uid';
      const metadata = JSON.stringify(record.details || record).replace(/'/g, "''");

      sql += `INSERT INTO sppb_records (user_uid, record_type, record_date, total_score, balance_score, walk_score, chair_score, raw_walk_time, raw_chair_time, raw_balance_side_by_side, raw_balance_semi_tandem, raw_balance_tandem, additional_details, created_at) VALUES (\n`;
      sql += `  '${uid}', '${mode}', '${dateStr}', ${total}, ${balance}, ${walk}, ${chair}, ${rawWalk}, ${rawChair}, ${sByS}, ${semiT}, ${tandem}, '${metadata}', ${ts}\n`;
      sql += `);\n`;
    });

    return sql;
  };

  const handleRemoteUpload = async () => {
    setUploadStatus('testing');
    setUploadMsg('正在連線至研究資料庫，進行安全數據封裝與同步寫入...');
    localStorage.setItem('vivifrail_remote_sql_url', remoteUrl);

    const targetRecords = LocalDbService.getHistory();
    const currentClinician = currentUser || null;
    const usersList = LocalDbService.getUsers();
    const finalUsers = usersList.length > 0 ? usersList : (currentClinician ? [currentClinician] : []);

    try {
      const response = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          syncTimestamp: Date.now(),
          recordsCount: targetRecords.length,
          usersCount: finalUsers.length,
          users: finalUsers.map(u => ({
            uid: u.uid,
            displayName: u.displayName || '未知受測者',
            email: u.email || `${u.uid}@vivifrail.local`,
            age: Math.round(Number(u.age) || 0),
            gender: u.gender || 'unknown',
            height: Number(u.height) || 0,
            weight: Number(u.weight) || 0,
            createdAt: Number(u.createdAt) || Date.now()
          })),
          records: targetRecords.map(r => {
            const u = r.user || (currentClinician ? {
              uid: currentClinician.uid,
              displayName: currentClinician.displayName,
              email: currentClinician.email,
              age: currentClinician.age,
              gender: currentClinician.gender,
              height: currentClinician.height,
              weight: currentClinician.weight
            } : null);

            return {
              id: r.id || crypto.randomUUID(),
              timestamp: Number(r.timestamp || Date.now()),
              mode: String(r.mode || 'sppb'),
              score: Math.round(Number(r.score !== undefined ? r.score : 0)),
              details: r.details || {},
              user: u ? {
                uid: u.uid,
                displayName: u.displayName || '未知受測者',
                email: u.email || `${u.uid}@vivifrail.local`,
                age: Math.round(Number(u.age) || 0),
                gender: u.gender || 'unknown',
                height: Number(u.height) || 0,
                weight: Number(u.weight) || 0,
                createdAt: Number((u as any).createdAt) || Date.now()
              } : null
            };
          })
        })
      });

      // 產生格式化最後同步時間：YYYY/MM/DD HH:mm
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const formattedTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      if (response.ok) {
        const syncedTotal = targetRecords.length;
        setUploadStatus('success');
        setLastSyncStatus('success');
        setLastSyncTime(formattedTime);
        setLastSyncedCount(syncedTotal);
        localStorage.setItem('vivifrail_last_sync_time', formattedTime);
        localStorage.setItem('vivifrail_last_synced_count', syncedTotal.toString());
        localStorage.setItem('vivifrail_last_sync_status', 'success');
        setUploadMsg(`已成功同步 ${syncedTotal} 筆資料`);
      } else {
        const errText = await response.text();
        setUploadStatus('error');
        setLastSyncStatus('error');
        localStorage.setItem('vivifrail_last_sync_status', 'error');
        setUploadMsg(`連線異常 (${response.status})：${errText || '無法寫入遠端資料庫'}`);
      }
    } catch (e: any) {
      console.error(e);
      // 網路或 CORS 離線時，標記狀態並提示可使用進階設定或 SQL 腳本
      setUploadStatus('error');
      setLastSyncStatus('error');
      localStorage.setItem('vivifrail_last_sync_status', 'error');
      setUploadMsg(`連線失敗（${e.message || '無法連線到本機 API 橋接埠 8000'}）。\n請確認 sppb_sync_receiver.py 服務已啟動，或展開「進階設定」複製完整 SQL 腳本。`);
    }
  };

  const handleRemoteSyncDown = async () => {
    setSyncStatus('syncing');
    setSyncMsg('正在連線中，安全地自外部主機拉取並同步本機受測者登入資料名單...');
    localStorage.setItem('vivifrail_remote_sql_url', remoteUrl);

    try {
      const queryChar = remoteUrl.includes('?') ? '&' : '?';
      const fetchUrl = `${remoteUrl}${queryChar}action=get_users`;
      
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });

      if (response.ok) {
        const data = await response.json();
        const usersArray = Array.isArray(data) ? data : (data.users || []);
        
        if (usersArray && usersArray.length > 0) {
          await LocalDbService.importBackup({ users: usersArray });
          setSyncStatus('success');
          setSyncMsg(`🎉 同步下載成功！已自外部主機完美下載 ${usersArray.length} 位受測長輩之身份資料與登入名冊。現在，即使處在「零網路環境」或「本機快取被不慎清空」的狀態下，這些長輩帳號也能在主機上順暢點擊，順利登入檢測！`);
          
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance("受測者登入名冊同步安全合併完成");
            utterance.lang = "zh-TW";
            window.speechSynthesis.speak(utterance);
          }
        } else {
          setSyncStatus('error');
          setSyncMsg('遠端伺服器回應成功，但內容中不包含任何受測長輩的使用者陣列資料。請確認接收端 API 輸出的 JSON 架構。');
        }
      } else {
        const errText = await response.text();
        setSyncStatus('error');
        setSyncMsg(`同步請求失敗。遠端主機狀態碼：${response.status}。錯誤細節：${errText || '無'}`);
      }
    } catch (e: any) {
      console.error(e);
      setSyncStatus('error');
      setSyncMsg(`主機未回應或受到防護限制。原因：${e.message || String(e)}。\n\n💡 快速完美解決方案：這通常是由於您的外部 SQL 主機尚未開發 GET 帳號接口，或者受到了跨來源政策 (CORS) 的限制。您可以點擊下方手動貼入您所下載的備份或使用者 JSON 格式來 100% 毫秒完成本機登入資料同步！`);
    }
  };

  return (
    <div className={`sticky top-0 z-50 p-3 border-b flex flex-wrap gap-3 items-center justify-between ${settings.highContrast ? 'bg-black border-yellow-400' : 'bg-slate-900 border-slate-800'} shadow-md`}>
      {/* Font Size & Visual Scaling section */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs font-black mr-1 hidden sm:inline">字級調整:</span>
        <button 
          onClick={() => setSettings(s => ({ ...s, fontSize: Math.max(1, s.fontSize - 0.1) }))}
          className={`px-3 py-1.5 rounded-lg font-black border text-sm transition-all active:scale-90 ${settings.highContrast ? 'border-yellow-400 text-yellow-400 hover:bg-yellow-400/20' : 'bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700'}`}
          title="調小全文字級"
        >
          A -
        </button>
        <button 
          onClick={() => setSettings(s => ({ ...s, fontSize: Math.min(1.8, s.fontSize + 0.1) }))}
          className={`px-3 py-1.5 rounded-lg font-black border text-sm transition-all active:scale-90 ${settings.highContrast ? 'border-yellow-400 text-yellow-400 hover:bg-yellow-400/20' : 'bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700'}`}
          title="調大全文字級"
        >
          A +
        </button>
      </div>

      {/* --- REASSURED DATABASE SQL INSTANT SYNC CENTER (Direct top access for safety) --- */}
      <div className="flex flex-wrap gap-2 items-center">
        <button 
          onClick={() => {
            const allHist = LocalDbService.getHistory();
            const sql = generateAllUsersSqlScript(allHist, currentUser || null);
            setSqlScript(sql);
            setShowSqlUploadModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-xs transition-colors active:scale-95 shadow-sm"
          title="開啟資料同步視窗，隨時將本機受測者名單與 SPPB 紀錄同步至研究資料庫"
        >
          <span>📤 資料同步</span>
        </button>

        <button 
          onClick={async () => {
            setSyncStatus('idle');
            setSyncMsg('');
            setManualUsersJson('');
            setShowSyncModal(true);
            await handleRemoteSyncDown();
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs transition-colors active:scale-95 shadow-sm"
          title="自遠端 SQL 伺服器同步拉取長輩帳號，即使前端資料庫被不慎清除也能在無網路/離線時正常登入！"
        >
          <span>🔄 同步本地登入資料</span>
        </button>
      </div>

      {/* Mode selectors */}
      <div className="flex gap-2 items-center">
        <button 
          onClick={() => setSettings(s => ({ ...s, voiceAssist: !s.voiceAssist }))}
          className={`px-3 py-1.5 rounded-lg font-bold border text-xs transition-all active:scale-90 ${settings.voiceAssist ? 'bg-blue-600 text-white border-blue-600' : (settings.highContrast ? 'border-yellow-400 text-yellow-400' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-705')}`}
        >
          {settings.voiceAssist ? '🔊 語音開' : '🔇 語音關'}
        </button>
        <button 
          onClick={() => setSettings(s => ({ ...s, highContrast: !s.highContrast }))}
          className={`px-3 py-1.5 rounded-lg font-bold border text-xs transition-all active:scale-90 ${settings.highContrast ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-slate-850 text-slate-200 border-slate-700'}`}
        >
          {settings.highContrast ? '標準模式' : '高對比模式'}
        </button>
        <button 
          onClick={() => setSettings(s => ({ ...s, layout: s.layout === 'landscape' ? 'portrait' : 'landscape' }))}
          className={`px-3 py-1.5 rounded-lg font-bold border text-xs transition-style active:scale-90 ${settings.layout === 'portrait' ? 'bg-orange-500 text-white border-orange-500' : (settings.highContrast ? 'border-yellow-400 text-yellow-400' : 'bg-slate-805 text-slate-300 border-slate-700')}`}
        >
          {settings.layout === 'landscape' ? '🖥️ 橫向' : '📱 縱向'}
        </button>
      </div>

      {/* ==================== MODAL 1: SQL UPLOAD REPORT ==================== */}
      {showSqlUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border-2 border-indigo-500/20 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 my-auto">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-50/80 to-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📤</span>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  資料同步
                </h3>
              </div>
              <button 
                onClick={() => setShowSqlUploadModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain">
              {/* 1. 本機尚未同步紀錄 */}
              <div className="flex items-baseline justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <span className="text-sm font-bold text-slate-600">本機尚未同步紀錄：</span>
                <span className="text-2xl font-black text-indigo-600">
                  {LocalDbService.getHistory().length} <span className="text-xs font-bold text-slate-500">筆</span>
                </span>
              </div>

              {/* 2. 主操作按鈕：[ 上傳至研究資料庫 ] */}
              <button 
                onClick={handleRemoteUpload}
                disabled={uploadStatus === 'testing'}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-2xl font-black text-base shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
              >
                {uploadStatus === 'testing' ? (
                  <>
                    <span className="animate-spin inline-block">⏳</span>
                    <span>正在上傳同步中...</span>
                  </>
                ) : (
                  <span>[ 上傳至研究資料庫 ]</span>
                )}
              </button>

              {/* 3. 同步結果回報狀態 */}
              {(uploadStatus === 'success' || (!uploadStatus && lastSyncStatus === 'success') || (uploadStatus === 'idle' && lastSyncTime)) && (
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-emerald-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-sm text-emerald-700">
                    <span>✅ 已成功同步 {lastSyncedCount || LocalDbService.getHistory().length} 筆資料</span>
                  </div>
                  <div className="text-xs font-semibold text-emerald-800/80 pl-5">
                    最後同步：{lastSyncTime || '2026/09/17 00:55'}
                  </div>
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-sm text-rose-700">
                    <span>⚡ 連線同步提示</span>
                  </div>
                  <p className="text-xs text-rose-800/90 whitespace-pre-wrap leading-relaxed">
                    {uploadMsg}
                  </p>
                </div>
              )}

              {/* 4. DB_CONFIG 程式碼區塊 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                  <span className="font-mono text-slate-600">DB_CONFIG 連線設定</span>
                  <button 
                    onClick={() => {
                      const dbConfigStr = `DB_CONFIG = {\n    "host": "localhost",\n    "port": 5432,\n    "dbname": "VIVIFRAIL",\n    "user": "postgres",\n    "password": "0933512612"\n}`;
                      navigator.clipboard.writeText(dbConfigStr);
                      alert('DB_CONFIG 設定已複製！');
                    }}
                    className="text-indigo-600 hover:text-indigo-800 font-bold"
                  >
                    複製
                  </button>
                </div>
                <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#0f172a] shadow-inner">
                  <pre className="p-4 font-mono text-xs text-emerald-400 leading-relaxed overflow-x-auto selection:bg-indigo-500 selection:text-white">
{`DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "VIVIFRAIL",
    "user": "postgres",
    "password": "0933512612"
}`}
                  </pre>
                </div>
              </div>

              {/* 5. 進階設定 > (可摺疊/開展) */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center justify-between w-full text-xs font-black text-slate-500 hover:text-indigo-600 transition py-1"
                >
                  <span className="flex items-center gap-1">
                    進階設定
                  </span>
                  <span className={`transform transition-transform ${showAdvancedSettings ? 'rotate-90' : ''}`}>
                    &gt;
                  </span>
                </button>

                {showAdvancedSettings && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-in fade-in duration-150 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">同步接收端 API 接口 (URL)</label>
                      <input 
                        type="url"
                        value={remoteUrl}
                        onChange={(e) => setRemoteUrl(e.target.value)}
                        placeholder="http://127.0.0.1:8000/api/sppb_sync"
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-slate-700 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                      <p className="text-[11px] text-slate-400">本機請確保已在終端機執行 <code>python sppb_sync_receiver.py</code></p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700">離線 SQL 批次插入腳本 (備用)</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(sqlScript);
                            alert("SQL 匯入腳本已成功複製！可直接至 pgAdmin 執行。");
                          }}
                          className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-lg text-[11px] font-black hover:bg-indigo-100 transition"
                        >
                          📋 複製完整 SQL
                        </button>
                      </div>
                      <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] max-h-[120px] overflow-auto border border-slate-800">
                        {sqlScript}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button 
                onClick={() => setShowSqlUploadModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: LOGIN SYNC REPORT ==================== */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] border-4 border-emerald-600 shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center text-slate-850">
              <div>
                <h3 className="text-xl font-black text-emerald-900 flex items-center gap-1.5">
                  <span>🔄 同步本地登入資料 (診間安全登入防護)</span>
                </h3>
                <p className="text-xs font-bold text-slate-500">當快取或資料清空時，能從遠端資料庫下載完整的長輩名冊，免除無法登入的疑慮！</p>
              </div>
              <button 
                onClick={() => setShowSyncModal(false)}
                className="w-8 h-8 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-full font-black text-base flex items-center justify-center cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-slate-755 text-sm">
              <div className="space-y-1.5">
                <label className="text-base font-black text-slate-700 block text-xs">1. 外部伺服器接收端 API 網址</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://your-host.com/api/sppb"
                    className="flex-grow p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold font-mono text-slate-700 focus:outline-none focus:border-emerald-500 text-xs"
                  />
                  <button 
                    onClick={handleRemoteSyncDown}
                    className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow transition active:scale-95"
                  >
                    更新下載登入檔
                  </button>
                </div>
              </div>

              {/* Sync Status Info */}
              {syncStatus !== 'idle' && (
                <div className={`p-4 rounded-xl border-2 font-bold text-xs leading-relaxed ${
                  syncStatus === 'syncing' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  syncStatus === 'success' ? 'bg-emerald-600 border-emerald-700 text-white' :
                  'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <p className="font-extrabold flex items-center gap-1 mb-1 text-sm">
                    {syncStatus === 'syncing' && '⏳ 帳號資料下載中...'}
                    {syncStatus === 'success' && '✨ 登入名單同步對接成功！'}
                    {syncStatus === 'error' && '⚡ 遠端拉取同步提示'}
                  </p>
                  <p className="whitespace-pre-wrap">{syncMsg}</p>
                </div>
              )}

              {/* Manual JSON Copy-Paste block */}
              <div className="space-y-1.5 border-t pt-3">
                <label className="text-base font-black text-slate-700 block text-xs">2. 備份對接方案：貼上長輩帳號 JSON</label>
                <p className="text-xs text-slate-400 font-bold">
                  如果受到跨網域 (CORS) 阻擋，您可以直接將以前匯出的帳號陣列 JSON 貼在下方：
                </p>
                <textarea 
                  rows={3}
                  value={manualUsersJson}
                  onChange={(e) => setManualUsersJson(e.target.value)}
                  placeholder='{"users": [{"uid": "u1", "displayName": "張爺爺", "email": "zhang@mail.com"}]}'
                  className="w-full p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!manualUsersJson.trim()) {
                      alert('請先貼上有用的 JSON 帳號名冊內容！');
                      return;
                    }
                    try {
                      const parsed = JSON.parse(manualUsersJson);
                      const usersToImport = Array.isArray(parsed) ? parsed : (parsed.users || null);
                      if (!usersToImport) {
                        throw new Error('未在 JSON 中發現 valid users arrays 帳號欄位');
                      }
                      await LocalDbService.importBackup({ users: usersToImport });
                      alert(`🎉 還原成功！已將 ${usersToImport.length} 位長輩帳號寫入本地快取。`);
                      setManualUsersJson('');
                      window.location.reload();
                    } catch (err: any) {
                      alert(`JSON 分析失敗：${err.message}`);
                    }
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black transition"
                >
                  📥 手動還原長輩帳號
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 rounded-b-[32px] flex justify-end">
              <button 
                onClick={() => setShowSyncModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold text-xs"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessibilityBar;
