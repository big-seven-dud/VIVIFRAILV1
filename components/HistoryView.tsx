import React, { useState, useEffect } from 'react';
import { TestResult, UserProfile } from '../types';
import { LocalDbService } from '../src/lib/LocalStorageService';
import * as XLSX from 'xlsx';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';

interface Props {
  user: UserProfile;
  onBack: () => void;
  onUpdateProfile: (updatedProfile: UserProfile) => void;
}

const HistoryView: React.FC<Props> = ({ user, onBack, onUpdateProfile }) => {
  const [records, setRecords] = useState<TestResult[]>([]);
  const [gameRecords, setGameRecords] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'tests' | 'games'>('tests');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [editData, setEditData] = useState({
    displayName: user.displayName,
    age: user.age,
    weight: user.weight,
    height: user.height
  });
  const [updating, setUpdating] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TestResult | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Remote SQL Synchronizer States ---
  const [showSqlUploadModal, setShowSqlUploadModal] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string>(
    localStorage.getItem('vivifrail_remote_sql_url') || 'http://127.0.0.1:8000/api/sppb_sync'
  );
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState<string>('');
  const [sqlScript, setSqlScript] = useState<string>('');
  const [uploadTarget, setUploadTarget] = useState<'all' | 'single'>('all');
  const [singleRecordToUpload, setSingleRecordToUpload] = useState<any>(null);

  const generateSqlScript = (userProfile: UserProfile, dataArray: any[]) => {
    let sql = `-- =========================================================\n`;
    sql += `-- VIVIFRAIL SPPB CLINICAL COGNITIVE RECORD & ACCOUNT DATABASE EXPORT (PostgreSQL)\n`;
    sql += `-- Generated: ${new Date().toLocaleString()}\n`;
    sql += `-- Subject: ${userProfile.displayName} (Email: ${userProfile.email})\n`;
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

    // 3. Write Subject Identity
    sql += `-- =========================================================\n`;
    sql += `-- INSERTING REGISTERED ELDERS ACCOUNT IDENTITIES\n`;
    sql += `-- =========================================================\n`;
    
    const safeName = userProfile.displayName.replace(/'/g, "''");
    const safeEmail = userProfile.email.replace(/'/g, "''");
    const uid = userProfile.uid || 'unknown_uid';
    const age = userProfile.age || 0;
    const height = userProfile.height || 0;
    const weight = userProfile.weight || 0;
    const gender = userProfile.gender || 'unknown';

    sql += `INSERT INTO sppb_users (uid, display_name, email, age, gender, height, weight, created_at) \n`;
    sql += `VALUES ('${uid}', '${safeName}', '${safeEmail}', ${age}, '${gender}', ${height}, ${weight}, ${Date.now()})\n`;
    sql += `ON CONFLICT (uid) DO UPDATE SET display_name='${safeName}', age=${age}, height=${height}, weight=${weight};\n\n`;

    // 4. Write Records
    sql += `-- =========================================================\n`;
    sql += `-- INSERTING EVALUATION & GAME EXERCISE HISTORY RECORDS\n`;
    sql += `-- =========================================================\n`;

    dataArray.forEach(record => {
      const ts = record.timestamp || Date.now();
      const dateStr = new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
      const mode = record.mode || 'sppb';
      
      // Calculate scores
      const details = record.details || {};
      const balance = details.balanceScore ?? (record.balanceScore ?? 0);
      const walk = details.walkScore ?? (record.walkScore ?? 0);
      const chair = details.chairScore ?? (record.chairScore ?? 0);
      const total = Math.round(Number(record.score !== undefined ? record.score : (balance + walk + chair)));

      // Extract raw times
      const rawWalk = details.rawWalkTime || details.rawWalk6mTime || record.rawWalkTime || record.rawWalk6mTime || 0;
      const rawChair = details.rawChairTime || record.rawChairTime || 0;
      const sByS = details.rawBalanceSideBySide || record.rawBalanceSideBySide || 0;
      const semiT = details.rawBalanceSemiTandem || record.rawBalanceSemiTandem || 0;
      const tandem = details.rawBalanceTandem || record.rawBalanceTandem || 0;

      // JSON metadata payload
      const metadata = JSON.stringify(record.details || record).replace(/'/g, "''");

      sql += `INSERT INTO sppb_records (user_uid, record_type, record_date, total_score, balance_score, walk_score, chair_score, raw_walk_time, raw_chair_time, raw_balance_side_by_side, raw_balance_semi_tandem, raw_balance_tandem, additional_details, created_at) VALUES (\n`;
      sql += `  '${userProfile.uid}', '${mode}', '${dateStr}', ${total}, ${balance}, ${walk}, ${chair}, ${rawWalk}, ${rawChair}, ${sByS}, ${semiT}, ${tandem}, '${metadata}', ${ts}\n`;
      sql += `);\n`;
    });

    return sql;
  };

  const handleRemoteUpload = async (targetRecords: any[]) => {
    setUploadStatus('testing');
    setUploadMsg('正在建立通訊並推送至 SQL Web Service 中...');
    localStorage.setItem('vivifrail_remote_sql_url', remoteUrl);

    const currentUserPayload = {
      uid: user.uid,
      displayName: user.displayName || '未知受測者',
      email: user.email || `${user.uid}@vivifrail.local`,
      age: Math.round(Number(user.age) || 0),
      gender: user.gender || 'unknown',
      height: Number(user.height) || 0,
      weight: Number(user.weight) || 0,
      createdAt: Number(user.createdAt) || Date.now()
    };

    const formattedRecords = targetRecords.map(r => {
      const mode = (r.mode || 'sppb') as string;
      const details = r.details || (mode === 'sppb' ? r : {});
      const balance = details.balanceScore ?? (r.balanceScore ?? 0);
      const walk = details.walkScore ?? (r.walkScore ?? 0);
      const chair = details.chairScore ?? (r.chairScore ?? 0);
      const totalScore = Math.round(Number(r.score !== undefined ? r.score : (balance + walk + chair)));

      return {
        id: r.id || crypto.randomUUID(),
        timestamp: Number(r.timestamp || Date.now()),
        mode,
        score: totalScore,
        details,
        user: currentUserPayload
      };
    });

    try {
      const response = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          syncTimestamp: Date.now(),
          recordsCount: formattedRecords.length,
          usersCount: 1,
          users: [currentUserPayload],
          records: formattedRecords
        })
      });

      if (response.ok) {
        setUploadStatus('success');
        setUploadMsg(`上傳成功！已順利將您的 ${formattedRecords.length} 筆評估/運動歷史紀錄安全推送至遠端 SQL 主機資料庫。`);
      } else {
        const errText = await response.text();
        setUploadStatus('error');
        setUploadMsg(`上傳異常：遠端接收端回傳狀態碼 ${response.status}。錯誤細節：${errText || '未知接口錯誤'}`);
      }
    } catch (e: any) {
      console.error(e);
      setUploadStatus('error');
      setUploadMsg(`通訊測試失敗！原因：${e.message || String(e)}。
這通常是因為目標伺服器未啟用跨來源資源共用 (CORS) 標頭，或其主機防火牆封鎖了來自 iframe 的非同源 POST 請求。
別擔心！此系統已為您在下方自動生成了與此紀錄完全對齊的 100% 精準「標準 PostgreSQL 匯入腳本 (Standard PostgreSQL Insert Commands)」，您可以直接一鍵複製至遠端控制台內手動載入！`);
    }
  };

  const getLatestLevelKey = (): string => {
    if (records.length === 0) return 'D';
    const record = records[0];
    const score = (record.balanceScore || 0) + (record.walkScore || 0) + (record.chairScore || 0);
    const walk6mTime = record.rawWalk6mTime || 0;
    const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
    
    let lvl = 'D';
    if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) lvl = 'A';
    else if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) lvl = 'B';
    else if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) lvl = 'C';
    else lvl = 'D';

    const hasRisk = record.fallRisk?.hasRisk || (record.rawTugTime && record.rawTugTime > 20) || (record.rawWalk6mTime && record.rawWalk6mTime > 7.5);
    if (hasRisk && (lvl === 'B' || lvl === 'C')) {
      lvl += '+';
    }
    return lvl;
  };

  const getLevelPrescription = (levelKey?: string) => {
    const rawKey = levelKey || getLatestLevelKey();
    const cleanKey = rawKey.split(' ')[0].trim();

    switch (cleanKey) {
      case 'A':
        return {
          label: 'A 級 (失能者)',
          march: 50,
          curl: 36,
          sitStand: 36,
          kick: 36,
          stretch: 0,
          grip: 36,
          sitStandNote: '需有人輔助',
          stretchNote: '不指派',
          kickNote: ''
        };
      case 'B':
        return {
          label: 'B 級 (衰弱者)',
          march: 500,
          curl: 36,
          sitStand: 36,
          kick: 0,
          stretch: 0,
          grip: 36,
          sitStandNote: '模擬坐下動作',
          kickNote: '不指派',
          stretchNote: '不指派'
        };
      case 'B+':
        return {
          label: 'B+ 級 (衰弱者)',
          march: 500,
          curl: 36,
          sitStand: 36,
          kick: 0,
          stretch: 9,
          grip: 36,
          sitStandNote: '模擬坐下動作',
          kickNote: '不指派',
          stretchNote: 'B+ 條件觸發'
        };
      case 'C':
        return {
          label: 'C 級 (衰弱前期者)',
          march: 900,
          curl: 36,
          sitStand: 36,
          kick: 36,
          stretch: 9,
          grip: 0,
          sitStandNote: '自主起身',
          gripNote: '不指派'
        };
      case 'C+':
        return {
          label: 'C+ 級 (衰弱前期者)',
          march: 900,
          curl: 36,
          sitStand: 36,
          kick: 36,
          stretch: 9,
          grip: 36,
          sitStandNote: '自主起身',
          gripNote: 'C+ 條件觸發'
        };
      case 'D':
      default:
        return {
          label: 'D 級 (健康者)',
          march: 1000,
          curl: 36,
          sitStand: 36,
          kick: 36,
          stretch: 9,
          grip: 36,
          sitStandNote: '自主起身'
        };
    }
  };

  const getLatestLevelString = () => {
    if (records.length === 0) return '尚未進行評估';
    const record = records[0];
    const score = (record.balanceScore || 0) + (record.walkScore || 0) + (record.chairScore || 0);
    const walk6mTime = record.rawWalk6mTime || 0;
    const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
    
    let levelId = 'D';
    let label = '健康者';
    
    if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) {
      levelId = 'A';
      label = '失能者';
    } else if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) {
      levelId = 'B';
      label = '衰弱者';
    } else if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) {
      levelId = 'C';
      label = '衰弱前期者';
    } else {
      levelId = 'D';
      label = '健康者';
    }

    const hasRisk = record.fallRisk?.hasRisk || (record.rawTugTime && record.rawTugTime > 20) || (record.rawWalk6mTime && record.rawWalk6mTime > 7.5);
    const suffix = (hasRisk && (levelId === 'B' || levelId === 'C')) ? '+' : '';
    return `${levelId}${suffix} 級 (${label})`;
  };
  
  // Create login QR data (身份資訊 only, no password)
  const qrData = JSON.stringify({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName
  });

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const userHistory = LocalDbService.getHistoryByUser(user.uid);
      
      const tests = userHistory.filter(h => h.mode === 'sppb').map(h => ({
        ...h.details,
        id: h.id,
        timestamp: h.timestamp
      }));
      setRecords(tests.sort((a, b) => b.timestamp - a.timestamp));

      const games = userHistory.filter(h => h.mode !== 'sppb' && h.mode !== 'icope' && h.mode !== 'fall_risk');
      setGameRecords(games.sort((a, b) => b.timestamp - a.timestamp));

    } catch (e: any) {
      console.error("History Fetch Error:", e);
      setFetchError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.uid]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const updatedFields = {
        displayName: editData.displayName,
        age: Number(editData.age),
        weight: Number(editData.weight),
        height: Number(editData.height)
      };
      const newUser = { ...user, ...updatedFields };
      
      // Update local user record
      localStorage.setItem('vivifrail_user', JSON.stringify(newUser));
      
      // Update in users list
      const users = LocalDbService.getUsers();
      const idx = users.findIndex(u => u.uid === user.uid);
      if (idx !== -1) {
        users[idx] = newUser;
        localStorage.setItem('vivifrail_users', JSON.stringify(users));
      }

      onUpdateProfile(newUser);
      setIsEditing(false);
    } catch (err) {
      console.error("Update failed:", err);
      alert("更新失敗，請稍後再試");
    } finally {
      setUpdating(false);
    }
  };

  const calculateDailyStats = () => {
    const today = new Date().toLocaleDateString();
    const todayGames = gameRecords.filter(r => {
      const d = new Date(r.timestamp);
      return d.toLocaleDateString() === today;
    });
    
    const stats = {
      punch: 0,
      kick: 0,
      sitStand: 0,
      march: 0,
      boxingLeft: 0,
      boxingRight: 0,
      soccerGoal: 0,
      bubblePop: 0
    };

    todayGames.forEach(r => {
      const gMode = r.mode;
      if (gMode === 'obstacle_race' && r.details?.stats) {
        stats.punch += (r.details.stats.punch || 0);
        stats.kick += (r.details.stats.kick || 0);
        stats.sitStand += (r.details.stats.sitStand || r.details.stats['sit-stand'] || 0);
        stats.march += (r.details.stats.march || 0);
      } else if (gMode === 'boxing' && r.details) {
        stats.boxingLeft += (r.details.leftPunches || 0);
        stats.boxingRight += (r.details.rightPunches || 0);
      } else if (gMode === 'soccer' && r.details) {
        stats.soccerGoal += (r.details.goals || 0);
      } else if (gMode === 'bubble' && r.details) {
        stats.bubblePop += (r.details.bubbleClearedCount || r.details.shotsCount || 0);
      }
    });

    return stats;
  };

  const dailyStats = calculateDailyStats();
  const currentPrescription = getLevelPrescription();

  return (
    <div className="flex flex-col space-y-8 py-6">
      <div className="flex justify-between items-center">
        <h2 className="text-4xl font-black text-slate-800">歷史測驗紀錄</h2>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowQR(true)}
            className="px-6 py-3 bg-green-50 text-green-600 rounded-full font-bold border-2 border-green-100 flex items-center gap-2"
          >
            <span>📱</span> 顯示登入 QR
          </button>
          <button 
            onClick={onBack}
            className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-bold shadow-lg"
          >
            返回
          </button>
        </div>
      </div>

      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <h3 className="text-2xl font-black text-slate-800">我的登入 QR Code</h3>
              <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 flex justify-center">
                <QRCodeCanvas 
                  value={qrData} 
                  size={256}
                  level="H"
                  includeMargin={true}
                  className="rounded-xl"
                />
              </div>
              <p className="text-slate-500 font-medium">
                展示此 QR Code 即可在其他設備快速登入。<br/>
                <span className="text-xs text-red-500 mt-2 block">(請注意：QR Code 包含敏感資訊，請妥善保管)</span>
              </p>
              <button 
                onClick={() => setShowQR(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xl"
              >
                關閉
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Stats Card */}
      <div className="bg-blue-600 text-white p-8 rounded-[40px] shadow-2xl space-y-6 relative overflow-hidden">
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h3 className="text-3xl font-black">{user.displayName} 的健康檔案</h3>
            <p className="text-xl font-bold opacity-80 mt-1">年齡：{user.age} 歲 | 性別：{user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '其他'}</p>
          </div>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full font-black text-sm transition"
          >
            {isEditing ? '取消修改' : '修改資料 ✏️'}
          </button>
        </div>
        
        {isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white/10 p-6 rounded-3xl border-2 border-white/20 animate-in fade-in slide-in-from-top-4">
            <div className="space-y-2 lg:col-span-3">
              <label className="text-sm font-bold opacity-80">姓名</label>
              <input 
                type="text"
                value={editData.displayName}
                onChange={(e) => setEditData({...editData, displayName: e.target.value})}
                className="w-full p-4 bg-white/20 rounded-xl text-2xl font-black outline-none border-2 border-transparent focus:border-white/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold opacity-80">年齡 (歲)</label>
              <input 
                type="number"
                value={editData.age}
                onChange={(e) => setEditData({...editData, age: parseInt(e.target.value)})}
                className="w-full p-4 bg-white/20 rounded-xl text-2xl font-black outline-none border-2 border-transparent focus:border-white/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold opacity-80">身高 (cm)</label>
              <input 
                type="number"
                step="0.1"
                value={editData.height}
                onChange={(e) => setEditData({...editData, height: parseFloat(e.target.value)})}
                className="w-full p-4 bg-white/20 rounded-xl text-2xl font-black outline-none border-2 border-transparent focus:border-white/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold opacity-80">體重 (kg)</label>
              <input 
                type="number"
                step="0.1"
                value={editData.weight}
                onChange={(e) => setEditData({...editData, weight: parseFloat(e.target.value)})}
                className="w-full p-4 bg-white/20 rounded-xl text-2xl font-black outline-none border-2 border-transparent focus:border-white/50"
              />
            </div>
            <div className="md:col-span-3">
              <button 
                onClick={handleUpdate}
                disabled={updating}
                className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center"
              >
                {updating ? '儲存中...' : '確認儲存修改'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
              <p className="text-sm font-bold opacity-80">身高</p>
              <p className="text-3xl font-black">{user.height} <span className="text-sm">cm</span></p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
              <p className="text-sm font-bold opacity-80">體重</p>
              <p className="text-3xl font-black">{user.weight} <span className="text-sm">kg</span></p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
              <p className="text-sm font-bold opacity-80">BMI</p>
              <p className="text-3xl font-black">{(user.weight / Math.pow(user.height / 100, 2)).toFixed(1)}</p>
            </div>
            <div className="bg-yellow-500/25 border border-yellow-400/50 p-4 rounded-2xl backdrop-blur-sm flex flex-col justify-center">
              <p className="text-sm font-black text-yellow-250">最新評估分級</p>
              <p className="text-2xl font-black text-white">{getLatestLevelString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow flex bg-slate-100 p-2 rounded-3xl gap-2">
          <button 
            onClick={() => setActiveTab('tests')}
            className={`flex-1 py-4 rounded-2xl font-black text-xl transition ${activeTab === 'tests' ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
          >
            體能測驗 📋
          </button>
          <button 
            onClick={() => setActiveTab('games')}
            className={`flex-1 py-4 rounded-2xl font-black text-xl transition ${activeTab === 'games' ? 'bg-white text-green-600 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
          >
            運動遊戲 🎮
          </button>
        </div>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="px-8 py-4 bg-blue-50 text-blue-600 rounded-3xl font-black text-lg border-2 border-blue-100 flex items-center justify-center gap-2 active:scale-95 transition"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : "🔄 立即同步"}
        </button>

        <button 
          onClick={() => {
            setUploadTarget('all');
            setSingleRecordToUpload(null);
            const userRecords = LocalDbService.getHistoryByUser(user.uid);
            const sql = generateSqlScript(user, userRecords);
            setSqlScript(sql);
            setUploadStatus('idle');
            setUploadMsg('');
            setShowSqlUploadModal(true);
          }}
          disabled={loading || (records.length === 0 && gameRecords.length === 0)}
          className="px-8 py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-3xl font-black text-lg border-2 border-indigo-200 flex items-center justify-center gap-2 active:scale-95 transition"
        >
          📤 遠端 SQL 上傳
        </button>
      </div>

      {activeTab === 'tests' && records.length > 0 && !selectedRecord && (
        <div className="bg-white p-8 rounded-[40px] shadow-xl border-4 border-slate-50">
          <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
            📊 總體能與分項趨勢圖
          </h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...records].reverse()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  stroke="#94a3b8"
                  fontSize={12}
                />
                <YAxis domain={[0, 12]} stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey={(r: any) => r.balanceScore + r.walkScore + r.chairScore} 
                  name="SPPB 總分"
                  stroke="#2563eb" 
                  strokeWidth={6} 
                  dot={{ r: 8, fill: '#2563eb', strokeWidth: 4, stroke: '#fff' }}
                  activeDot={{ r: 12 }}
                />
                <Line type="monotone" dataKey="balanceScore" name="平衡得分" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="walkScore" name="步行得分" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="chairScore" name="起坐得分" stroke="#a855f7" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selectedRecord ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setSelectedRecord(null)}
              className="flex items-center gap-2 text-slate-400 font-bold text-lg hover:text-slate-600 transition"
            >
              ← 返回紀錄列表
            </button>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  const data = [
                    ["Vivifrail SPPB 體能評估報告 (歷史紀錄)"],
                    ["受測者", user.displayName],
                    ["日期", new Date(selectedRecord.timestamp).toLocaleString()],
                    [""],
                    ["平衡力測試", selectedRecord.balanceScore],
                    ["- 雙腳並排站立", (selectedRecord as any).rawBalanceSideBySide || 0],
                    ["- 雙腳半並排站立", (selectedRecord as any).rawBalanceSemiTandem || 0],
                    ["- 雙腳直線站立", (selectedRecord as any).rawBalanceTandem || 0],
                    ["步行速度最佳", selectedRecord.walkScore, selectedRecord.rawWalkTime.toFixed(2) + " 秒"],
                    ["起坐能力測試", selectedRecord.chairScore, selectedRecord.rawChairTime.toFixed(2) + " 秒"],
                    ["總分", selectedRecord.balanceScore + selectedRecord.walkScore + selectedRecord.chairScore],
                    [""],
                    ["--- 起坐詳細數據 ---"],
                    ["次序", "耗時 (秒)"],
                    ...(selectedRecord.chairReps?.map((rep: any) => [`第 ${rep.id} 下`, rep.duration.toFixed(2)]) || [])
                  ];
                  const ws = XLSX.utils.aoa_to_sheet(data);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Record");
                  XLSX.writeFile(wb, `SPPB_Record_${user.displayName}_${new Date(selectedRecord.timestamp).getTime()}.xlsx`);
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-full font-black text-sm flex items-center gap-2 shadow-lg active:scale-95 transition h-10"
              >
                📥 下載此次 Excel
              </button>

              <button 
                onClick={() => {
                  setUploadTarget('single');
                  setSingleRecordToUpload(selectedRecord);
                  const sql = generateSqlScript(user, [selectedRecord]);
                  setSqlScript(sql);
                  setUploadStatus('idle');
                  setUploadMsg('');
                  setShowSqlUploadModal(true);
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-full font-black text-sm flex items-center gap-2 shadow-lg active:scale-95 transition h-10"
              >
                📤 上傳此筆至 SQL
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-4 border-blue-500">
              <h3 className="text-3xl font-black text-slate-800 mb-8 border-b-4 border-slate-50 pb-4">
                測驗詳細數據
              </h3>
              <div className="space-y-8">
                <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl">
                  <div>
                    <p className="text-slate-400 font-bold text-sm uppercase">起坐次數詳細</p>
                    <p className="text-xl font-black text-slate-700">5 次起坐總計 {selectedRecord.rawChairTime.toFixed(1)} 秒</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black text-blue-600">{selectedRecord.chairScore}分</p>
                  </div>
                </div>
                
                {selectedRecord.chairReps && selectedRecord.chairReps.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {selectedRecord.chairReps.map((rep: any) => (
                      <div key={rep.id} className="flex justify-between items-center p-4 bg-white border-2 border-slate-100 rounded-2xl">
                        <span className="font-bold text-slate-400">第 {rep.id} 下</span>
                        <div className="flex items-center gap-3">
                           <div className="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500" style={{ width: `${Math.min((rep.duration/3)*100, 100)}%` }} />
                           </div>
                           <span className="font-black text-slate-700">{rep.duration.toFixed(2)} 秒</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl">
                  <div>
                    <p className="text-slate-400 font-bold text-sm uppercase">步行速度測試</p>
                    <p className="text-xl font-black text-slate-700">兩趟最佳: {selectedRecord.rawWalkTime.toFixed(1)} 秒</p>
                    <p className="text-sm text-slate-400 font-bold italic mt-1">
                      (趟一: {selectedRecord.walkTrial1.toFixed(1)}s, 趟二: {selectedRecord.walkTrial2.toFixed(1)}s)
                    </p>
                  </div>
                  <div className="text-right">
                     <p className="text-4xl font-black text-green-600">{selectedRecord.walkScore}分</p>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl">
                  <div>
                    <p className="text-slate-400 font-bold text-sm uppercase">平衡力測試</p>
                    <p className="text-xl font-black text-slate-700">分級得分累計</p>
                    <div className="flex gap-2 mt-2">
                       <div className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs shadow-sm">
                         並排: <span className="font-black">{(selectedRecord as any).rawBalanceSideBySide || 0}s</span>
                       </div>
                       <div className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs shadow-sm">
                         半並排: <span className="font-black">{(selectedRecord as any).rawBalanceSemiTandem || 0}s</span>
                       </div>
                       <div className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs shadow-sm">
                         直線: <span className="font-black">{(selectedRecord as any).rawBalanceTandem || 0}s</span>
                       </div>
                    </div>
                  </div>
                   <div className="text-right">
                     <p className="text-4xl font-black text-orange-600">{selectedRecord.balanceScore}分</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-4 border-slate-100 flex flex-col items-center">
              <h3 className="text-2xl font-black text-slate-800 mb-4 self-start">能力分析雷達 (Pentagon)</h3>
              <div className="w-full h-full min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                    { subject: '平衡能力', A: (selectedRecord.balanceScore/4)*100, full: 100 },
                    { subject: '步行速度', A: (selectedRecord.walkScore/4)*100, full: 100 },
                    { subject: '肌力爆發', A: (selectedRecord.chairScore/4)*100, full: 100 },
                    { subject: '敏捷性', A: 80, full: 100 },
                    { subject: '心肺適能', A: 70, full: 100 },
                  ]}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 14, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar 
                      name="能力值" 
                      dataKey="A" 
                      stroke="#2563eb" 
                      fill="#3b82f6" 
                      fillOpacity={0.6} 
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-slate-400 font-bold text-center mt-4">
                雷達圖顯示您在五大指標中的優劣勢。<br/>得分越接近外圈表示該項能力越強。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {fetchError && (
            <div className="bg-red-50 border-4 border-red-100 p-8 rounded-[40px] text-center mb-8">
              <p className="text-xl font-black text-red-600 mb-2">資料讀取失敗</p>
              <p className="text-red-500 font-bold">{fetchError}</p>
              <button 
                onClick={fetchData}
                className="mt-4 px-8 py-2 bg-red-600 text-white rounded-full font-black active:scale-95 transition"
              >
                重試
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-20 text-2xl font-bold text-slate-400">載入中...</div>
          ) : activeTab === 'tests' ? (
            records.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[40px] border-4 border-dashed border-slate-200">
                <p className="text-2xl font-bold text-slate-400">目前尚無測驗紀錄</p>
              </div>
            ) : (
              <div className="space-y-4">
                {records.map((record, i) => {
                  const total = record.balanceScore + record.walkScore + record.chairScore;
                  let level = "衰弱";
                  let levelColor = "bg-red-100 text-red-600";
                  
                  if (total >= 10) {
                    level = "強健";
                    levelColor = "bg-green-100 text-green-600";
                  } else if (total >= 4) {
                    level = "衰弱前期";
                    levelColor = "bg-orange-100 text-orange-600";
                  }

                  return (
                    <div 
                      key={i} 
                      onClick={() => setSelectedRecord(record)}
                      className="bg-white p-6 rounded-[30px] border-4 border-slate-100 shadow-lg flex justify-between items-center transition hover:border-blue-200 cursor-pointer active:scale-98"
                    >
                      <div className="flex-grow">
                        <div className="flex items-center gap-3">
                          <p className="text-xl font-black text-slate-800">
                            {new Date(record.timestamp).toLocaleDateString()} {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <span className={`px-4 py-1 rounded-full text-sm font-black ${levelColor}`}>
                            {level}
                          </span>
                          {record.fallRisk?.hasRisk && (
                            <span className="px-4 py-1 bg-red-600 text-white rounded-full text-sm font-black animate-pulse">
                              ⚠️ 跌倒風險+
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-3">
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold border border-blue-100">平衡: {record.balanceScore}</span>
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg font-bold border border-green-100">步行: {record.walkScore}</span>
                          <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-lg font-bold border border-purple-100">起坐: {record.chairScore}</span>
                        </div>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-4xl font-black text-blue-600">{total} <span className="text-xl">分</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            gameRecords.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[40px] border-4 border-dashed border-slate-200">
                <p className="text-2xl font-bold text-slate-400">目前尚無遊戲紀錄</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Today's Aggregate Stats Summary */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-[40px] shadow-2xl border-4 border-slate-700/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl bg-white/10 p-3 rounded-2xl">📊</span>
                      <div>
                        <h3 className="text-3xl font-black text-white">今日運動總計</h3>
                        <p className="text-slate-400 font-bold">{new Date().toLocaleDateString()} 統計數據 (處方等級：{currentPrescription.label})</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">向上打擊 (伸展)</p>
                      <p className="text-3xl font-black text-orange-400">
                        {dailyStats.punch} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.stretch > 0 ? `${currentPrescription.stretch} 次` : '本級不指派'}</span>
                      </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">二頭彎舉 (拳擊)</p>
                      <p className="text-3xl font-black text-yellow-400">
                        {dailyStats.boxingLeft + dailyStats.boxingRight} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.curl} 次</span>
                      </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">腿部踢擊 (足球)</p>
                      <p className="text-3xl font-black text-blue-400">
                        {dailyStats.kick + dailyStats.soccerGoal} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.kick > 0 ? `${currentPrescription.kick} 次` : '本級不指派'}</span>
                      </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">起身動作 (坐站: {currentPrescription.sitStandNote})</p>
                      <p className="text-3xl font-black text-green-400">
                        {dailyStats.sitStand} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.sitStand} 次</span>
                      </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">原地踏步 (超慢跑)</p>
                      <p className="text-3xl font-black text-purple-400">
                        {dailyStats.march} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.march} 步</span>
                      </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">手部抓握 (捏合)</p>
                      <p className="text-3xl font-black text-pink-400">
                        {dailyStats.bubblePop} <span className="text-sm font-normal text-slate-300">/ 目標 {currentPrescription.grip > 0 ? `${currentPrescription.grip} 次` : '本級不指派'}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[40px] shadow-xl border-4 border-slate-50 mt-8">
                  <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                    📈 運動訓練成長趨勢 (各動作總數)
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <p className="text-lg font-black text-slate-600">💪 上肢訓練趨勢 (彎舉 / 打擊)</p>
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={[...gameRecords].reverse()}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="timestamp" 
                              tickFormatter={(t) => new Date(t).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                              fontSize={11}
                            />
                            <YAxis fontSize={11} />
                            <Tooltip 
                              labelFormatter={(t) => new Date(t).toLocaleString()}
                              contentStyle={{ borderRadius: '15px', border: 'none', shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                            <Line type="monotone" dataKey={(r: any) => (r.details?.leftPunches || 0) + (r.details?.rightPunches || 0)} name="二頭彎舉" stroke="#eab308" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 8 }} />
                            <Line type="monotone" dataKey={(r: any) => (r.details?.stats?.punch || 0)} name="向上打擊" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <p className="text-lg font-black text-slate-600">🦵 下肢與功能訓練趨勢 (踢擊 / 起身 / 踏步)</p>
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={[...gameRecords].reverse()}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="timestamp" 
                              tickFormatter={(t) => new Date(t).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                              fontSize={11}
                            />
                            <YAxis fontSize={11} />
                            <Tooltip 
                              labelFormatter={(t) => new Date(t).toLocaleString()}
                              contentStyle={{ borderRadius: '15px', border: 'none', shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                            <Line type="monotone" dataKey={(r: any) => (r.details?.goals || 0) + (r.details?.stats?.kick || 0)} name="腿部踢擊" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey={(r: any) => (r.details?.stats?.['sit-stand'] || r.details?.stats?.sitStand || 0)} name="起身動作" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey={(r: any) => (r.details?.stats?.march || 0)} name="原地踏步" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {gameRecords.map((record, i) => {
                    const gMode = record.mode;
                    const info = gMode === 'obstacle_race' 
                      ? { label: '障礙賽跑', icon: '🏃‍♂️', color: 'text-green-600', scoreLabel: '最大連擊', scoreUnit: 'Combo' }
                      : gMode === 'boxing'
                      ? { label: '拳擊大師', icon: '🥊', color: 'text-orange-600', scoreLabel: '最終得分', scoreUnit: '分' }
                      : gMode === 'soccer'
                      ? { label: '點球大戰', icon: '⚽', color: 'text-blue-600', scoreLabel: '最終得分', scoreUnit: '分' }
                      : gMode === 'bubble'
                      ? { label: '泡泡射手', icon: '🔮', color: 'text-pink-600', scoreLabel: '最終得分', scoreUnit: '分' }
                      : { label: '復健訓練', icon: '🎮', color: 'text-indigo-600', scoreLabel: '最終得分', scoreUnit: '分' };

                    const recordLvl = record.details?.level || record.level || 'D';
                    const recPrescription = getLevelPrescription(recordLvl);

                    return (
                      <div key={i} className="bg-white p-6 rounded-[30px] border-4 border-slate-100 shadow-lg flex flex-col gap-4 transition hover:border-slate-200">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{info.icon}</span>
                              <p className="text-2xl font-black text-slate-800">{info.label} - 等級 {recordLvl}</p>
                            </div>
                            <p className="text-slate-400 font-bold mt-1">
                              {new Date(record.timestamp).toLocaleDateString()} {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-tighter">{info.scoreLabel}</p>
                            <p className={`text-4xl font-black ${info.color}`}>{record.score || record.combo} <span className="text-xl">{info.scoreUnit}</span></p>
                          </div>
                        </div>
                        
                        {record.details && (
                          <div className="bg-slate-50 p-4 rounded-2xl grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {gMode === 'boxing' && (
                              <>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">二頭彎舉(左)</p>
                                  <p className="text-lg font-black">{record.details.leftPunches || 0} 次</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">二頭彎舉(右)</p>
                                  <p className="text-lg font-black">{record.details.rightPunches || 0} 次</p>
                                </div>
                                <div className="text-center col-span-2 bg-yellow-50 p-2 rounded-xl border border-yellow-200">
                                  <p className="text-xs font-bold text-yellow-800">當前等級二頭彎舉總進度</p>
                                  <p className="text-lg font-black text-yellow-600">
                                    已做完 {(record.details.leftPunches || 0) + (record.details.rightPunches || 0)} / 目標 {recPrescription.curl} 次
                                  </p>
                                </div>
                              </>
                            )}
                            {gMode === 'soccer' && (
                              <>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">進球(腿部踢擊)</p>
                                  <p className="text-lg font-black text-green-600">{record.details.goals || 0} 次</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">落空/撞擊</p>
                                  <p className="text-lg font-black text-red-600">{record.details.misses || 0} 次</p>
                                </div>
                                <div className="text-center col-span-2 bg-blue-50 p-2 rounded-xl border border-blue-200">
                                  <p className="text-xs font-bold text-blue-800">當前等級踢腿進度</p>
                                  <p className="text-lg font-black text-blue-600">
                                    已做完 {record.details.goals || 0} / 目標 {recPrescription.kick > 0 ? `${recPrescription.kick} 次` : '本級不指派'}
                                  </p>
                                </div>
                              </>
                            )}
                            {gMode === 'bubble' && (
                              <>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">手部抓握(消除泡泡)</p>
                                  <p className="text-lg font-black text-pink-600">{record.details.bubbleClearedCount || 0} 顆</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">捏合彈弓發射</p>
                                  <p className="text-lg font-black text-slate-700">{record.details.shotsCount || 0} 次</p>
                                </div>
                                <div className="text-center col-span-2 bg-pink-50 p-2 rounded-xl border border-pink-200">
                                  <p className="text-xs font-bold text-pink-800">當前等級抓握捏合進度</p>
                                  <p className="text-lg font-black text-pink-600">
                                    已做完 {record.details.bubbleClearedCount || record.details.shotsCount || 0} / 目標 {recPrescription.grip > 0 ? `${recPrescription.grip} 次` : '本級不指派'}
                                  </p>
                                </div>
                              </>
                            )}
                            {gMode === 'obstacle_race' && record.details.stats && (
                              <>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">向上打擊(伸展)</p>
                                  <p className="text-lg font-black text-orange-600">
                                    已做完 {record.details.stats.punch || 0} / 目標 {recPrescription.stretch > 0 ? `${recPrescription.stretch} 次` : '本級不指派'}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">腿部踢擊</p>
                                  <p className="text-lg font-black text-blue-600">
                                    已做完 {record.details.stats.kick || 0} / 目標 {recPrescription.kick > 0 ? `${recPrescription.kick} 次` : '本級不指派'}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">起身動作(坐站)</p>
                                  <p className="text-lg font-black text-green-600">
                                    已做完 {record.details.stats.sitStand || record.details.stats['sit-stand'] || 0} / 目標 {recPrescription.sitStand} 次
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-bold text-slate-400">原地踏步</p>
                                  <p className="text-lg font-black text-purple-600">
                                    已做完 {record.details.stats.march || 0} / 目標 {recPrescription.march} 步
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* --- OFFLINE CAPABILITY REASSURANCE FOOTER --- */}
      <div className="mt-8 p-6 bg-blue-50 border-2 border-blue-100 rounded-3xl text-slate-600 text-base font-bold leading-relaxed space-y-1">
        <p className="text-blue-800 font-black text-lg flex items-center gap-2">
          <span>🛡️ 完整支援離線安全模式 (Offline Security Mode)</span>
        </p>
        <p>
          本系統之登入模組、體能測試、運動處分配件與歷史圖表等功能，均採用本地端安全資料庫 (<b className="text-blue-900 font-extrabold">Local Storage Engine</b>) 進行高防禦力架構開發。即使您處於完全斷網、戶外或無聯網(Offline)狀態下：
        </p>
        <ul className="list-disc pl-5 mt-1 space-y-1 font-semibold text-slate-500">
          <li>長輩註冊、登入系統、切換帳戶均能完全如常獨立運作，不受網路訊號影響。</li>
          <li>所有檢測結果、運動計步與時間成績皆會在本地安全地進行持久性存儲。</li>
          <li>當載入聯網狀態時，隨時點擊上方的 <b className="text-indigo-600 font-black">📤 遠端 SQL 上傳</b> 或單筆紀錄中的上傳按鈕，便能將數據完整備份至您的外部 SQL 主機。</li>
        </ul>
      </div>

      {/* --- REMOTE SQL SYNC MODAL --- */}
      {showSqlUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] border-4 border-indigo-600 shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 bg-indigo-50 border-b-2 border-indigo-100 flex justify-between items-center text-slate-800">
              <div>
                <h3 className="text-2xl font-black text-indigo-900 flex items-center gap-2">
                  <span>📤 實體別機遠端 SQL 資料庫同步</span>
                </h3>
                <p className="text-sm font-bold text-slate-500">將受測資料與臨床數據安全推送至您指定的主機 API 連接埠</p>
              </div>
              <button 
                onClick={() => setShowSqlUploadModal(false)}
                className="w-10 h-10 bg-slate-200 text-slate-600 hover:bg-slate-350 rounded-full font-black text-xl flex items-center justify-center cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto space-y-6 flex-grow">
              <div className="space-y-2">
                <label className="text-lg font-black text-slate-700 block">1. 輸入您外部主機的接收端 API API URL (URL)</label>
                <div className="flex gap-3">
                  <input 
                    type="url" 
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://your-remote-host.com/api/sppb"
                    className="flex-grow p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold font-mono text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
                  />
                  <button 
                    onClick={() => {
                      const listToSync = uploadTarget === 'single' && singleRecordToUpload ? [singleRecordToUpload] : LocalDbService.getHistoryByUser(user.uid);
                      handleRemoteUpload(listToSync);
                    }}
                    className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-base shadow-lg transition active:scale-95"
                  >
                    🚀 測試並上傳
                  </button>
                </div>
                <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                  * 系統將呼叫 <code className="bg-slate-100 p-0.5 rounded font-bold text-red-500 text-[11px]">POST</code> 方法發送標準 Application/JSON。發送負載包括受測者結構 (user) 與歷史詳情 (records) 配對陣列。
                </p>
              </div>

              {/* Status Banner */}
              {uploadStatus !== 'idle' && (
                <div className={`p-5 rounded-2xl border-2 font-bold text-base leading-relaxed ${
                  uploadStatus === 'testing' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                  uploadStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  'bg-rose-50 border-rose-100 text-rose-800'
                }`}>
                  <p className="font-extrabold flex items-center gap-1.5 mb-1">
                    {uploadStatus === 'testing' && '⏳ 通訊同步測試中...'}
                    {uploadStatus === 'success' && '✅ 資料已成功推送！'}
                    {uploadStatus === 'error' && '⚡ 遠端網路連線限制/狀態提示'}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{uploadMsg}</p>
                </div>
              )}

              {/* Generated SQL script viewer wrapper */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-lg font-black text-slate-750">
                  <span>2. 備用：當前紀錄 Standard SQL 批次插入指令檔</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(sqlScript);
                      if (typeof window !== 'undefined' && window.speechSynthesis) {
                        const utterance = new SpeechSynthesisUtterance("腳本已複製");
                        utterance.lang = "zh-TW";
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    className="px-4 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer hover:bg-indigo-100"
                  >
                    📋 一鍵複製 SQL 腳本
                  </button>
                </div>
                
                <div className="relative">
                  <pre className="p-5 bg-slate-900 text-emerald-400 rounded-3xl font-mono text-xs overflow-x-auto max-h-[220px] select-all border border-slate-850 leading-relaxed whitespace-pre scrollbar-thin">
                    {sqlScript}
                  </pre>
                  <p className="text-xs text-slate-400 font-bold text-right mt-1.5">
                    * 標準 PostgreSQL 語法，包含自動創建表格 schema (SERIAL, ON CONFLICT)。
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-100 border-t border-slate-200 rounded-b-[40px] flex justify-end gap-3">
              <button 
                onClick={() => setShowSqlUploadModal(false)}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-2xl font-extrabold text-sm shadow-md active:scale-95 transition"
              >
                關閉同步視窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
