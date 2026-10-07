import React, { useState, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { LocalDbService } from '../src/lib/LocalStorageService';
import { UserProfile } from '../types';

interface Props {
  onLoginSuccess: (user: UserProfile) => void;
  onGoToRegister: () => void;
}

const LoginView: React.FC<Props> = ({ onLoginSuccess, onGoToRegister }) => {
  const [email, setEmail] = useState('');
  const [selectedUserUid, setSelectedUserUid] = useState<string>('');
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [localUsers, setLocalUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const users = LocalDbService.getUsers();
    setLocalUsers(users);
    if (users.length > 0) {
      setSelectedUserUid(users[0].uid);
      setEmail(users[0].email);
    }
  }, []);

  const handleSelectUser = (uid: string) => {
    setSelectedUserUid(uid);
    const target = localUsers.find(u => u.uid === uid);
    if (target) {
      setEmail(target.email);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    try {
      const user = LocalDbService.loginUser(email.trim());
      if (user) {
        onLoginSuccess(user);
      } else {
        setError('找不到受測者帳號，請確認 Email 是否正確或先進行註冊');
      }
    } catch (err: any) {
      setError('登入失敗，請重試');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoggingIn(true);
    setError('');
    try {
      const profile: UserProfile = {
        uid: 'guest-' + Date.now(),
        email: 'guest@local',
        displayName: '訪客',
        age: 70,
        height: 165,
        weight: 60,
        gender: 'other',
        createdAt: Date.now()
      };
      
      // Save locally as current user
      localStorage.setItem('vivifrail_user', JSON.stringify(profile));
      onLoginSuccess(profile);
    } catch (err: any) {
      setError('訪客登入失敗');
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    let codeReader: BrowserMultiFormatReader | null = null;
    if (showScanner) {
      codeReader = new BrowserMultiFormatReader();
      codeReader.decodeFromVideoDevice(null, 'video', async (result) => {
        if (result) {
          try {
            const data = JSON.parse(result.getText());
            const identifier = data.email || data.uid;
            if (identifier) {
              const user = LocalDbService.loginUser(identifier);
              if (user) {
                onLoginSuccess(user);
              } else {
                setError('QR Code 所屬受測者未在本機註冊');
              }
            } else {
              setError('QR Code 格式不正確');
            }
          } catch (e) {
            setError('無效的 QR Code');
          }
          setShowScanner(false);
        }
      });
    }
    return () => {
      if (codeReader) codeReader.reset();
    };
  }, [showScanner]);

  return (
    <div className="flex flex-col space-y-8 py-10 max-w-md mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-black text-slate-800">受測者身分登入</h2>
        <p className="text-xl text-slate-500 font-bold">請選擇或輸入受測者帳號以開始評估</p>
      </div>

      {showScanner ? (
        <div className="relative rounded-[40px] overflow-hidden border-8 border-blue-500 bg-black aspect-square shadow-2xl">
          <video id="video" className="w-full h-full object-cover" />
          
          {/* Scanning Guide Overlay */}
          <div className="absolute inset-0 border-[60px] border-black/40 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-4 border-green-500 rounded-2xl relative shadow-[0_0_20px_rgba(34,197,94,0.5)]">
               {/* Scanning Line Animation */}
               <div className="absolute left-0 right-0 h-1 bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)] animate-pulse" style={{ top: '50%' }}></div>
               {/* Corners */}
               <div className="absolute -top-2 -left-2 w-8 h-8 border-t-8 border-l-8 border-green-500"></div>
               <div className="absolute -top-2 -right-2 w-8 h-8 border-t-8 border-r-8 border-green-500"></div>
               <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-8 border-l-8 border-green-500"></div>
               <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-8 border-r-8 border-green-500"></div>
            </div>
            <p className="text-white font-black text-lg mt-6 bg-black/60 px-4 py-2 rounded-xl backdrop-blur-sm">將 QR Code 對準框內</p>
          </div>

          <button 
            onClick={() => setShowScanner(false)}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md text-white px-10 py-3 rounded-full font-black shadow-xl active:scale-95 transition"
          >
            取消掃描
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-6">
          {localUsers.length > 0 && (
            <div className="space-y-2">
              <label className="text-xl font-bold text-slate-700 ml-4 flex items-center gap-2">
                <span>👥</span> 快速選擇本機受測者
              </label>
              <select
                value={selectedUserUid}
                onChange={(e) => handleSelectUser(e.target.value)}
                className="w-full p-6 rounded-[30px] border-4 border-blue-100 focus:border-blue-500 outline-none text-2xl font-bold bg-white text-slate-800 cursor-pointer shadow-sm"
              >
                {localUsers.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.email || u.uid})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xl font-bold text-slate-700 ml-4">受測者 Email / 帳號識別</label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
              placeholder="example@mail.com"
              required
            />
          </div>

          {error && <p className="text-red-500 text-center font-bold text-xl">{error}</p>}

          <div className="flex flex-col space-y-4 pt-4">
            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-6 bg-blue-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition"
            >
              {isLoggingIn ? '登入中...' : '以受測者身分登入'}
            </button>
            <button 
              type="button"
              onClick={() => setShowScanner(true)}
              className="w-full py-6 bg-green-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition flex items-center justify-center gap-4"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v1m0 11v1m4-12h1m-1 10h1m-5-7h1m-1 4h1m-4-2h1m-1 4h1m3-9V4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V7m-5 8v2a1 1 0 001 1h5a1 1 0 001-1v-5a1 1 0 00-1-1h-5a1 1 0 00-1 1v2z" />
              </svg>
              掃描身分 QR 登入
            </button>
            <button 
              type="button"
              onClick={onGoToRegister}
              className="w-full py-4 text-blue-600 text-xl font-bold"
            >
              建立新受測者帳號？立即註冊
            </button>
            <div className="flex items-center gap-4">
              <div className="flex-grow h-[1px] bg-slate-200"></div>
              <span className="text-slate-400 font-bold">或者</span>
              <div className="flex-grow h-[1px] bg-slate-200"></div>
            </div>
            <button 
              type="button"
              onClick={handleGuestLogin}
              disabled={isLoggingIn}
              className="w-full py-6 bg-slate-100 text-slate-600 text-3xl font-black rounded-[40px] shadow-lg active:scale-95 transition flex items-center justify-center gap-4 hover:bg-slate-200"
            >
              <span>👤</span>
              {isLoggingIn ? '載入中...' : '訪客快速測試'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default LoginView;
