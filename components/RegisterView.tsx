import React, { useState } from 'react';
import { LocalDbService } from '../src/lib/LocalStorageService';
import { UserProfile } from '../types';

interface Props {
  onRegisterSuccess: (user: UserProfile) => void;
  onGoToLogin: () => void;
}

const RegisterView: React.FC<Props> = ({ onRegisterSuccess, onGoToLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!age || !height || !weight) {
      setError('請填寫所有健康資訊');
      return;
    }

    try {
      const codeOrEmail = email.trim();
      const profile: UserProfile = {
        uid: codeOrEmail,
        email: codeOrEmail,
        displayName: name.trim(),
        age: parseInt(age),
        height: parseFloat(height),
        weight: parseFloat(weight),
        gender,
        createdAt: Date.now()
      };
      
      LocalDbService.registerUser(profile);
      // Also set as current user
      localStorage.setItem('vivifrail_user', JSON.stringify(profile));
      onRegisterSuccess(profile);
    } catch (err: any) {
      console.log('Register Error:', err.message);
      if (err.message === 'Email already registered' || err.message?.includes('已被註冊')) {
        setError('此受測者代碼或 Email 已被註冊使用');
      } else {
        setError(`註冊失敗：${err.message || '請檢查輸入資訊'}`);
      }
    }
  };

  return (
    <div className="flex flex-col space-y-8 py-10 max-w-md mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-black text-slate-800">建立新帳號</h2>
        <p className="text-xl text-slate-500 font-bold">加入我們，開始追蹤您的健康</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-6">
        <div className="space-y-2">
          <label className="text-xl font-bold text-slate-700 ml-4">姓名</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
            placeholder="請輸入姓名"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xl font-bold text-slate-700 ml-4">年齡</label>
            <input 
              type="number" 
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
              placeholder="歲"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xl font-bold text-slate-700 ml-4">性別</label>
            <select 
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold bg-white"
              required
            >
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xl font-bold text-slate-700 ml-4">身高 (cm)</label>
            <input 
              type="number" 
              step="0.1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
              placeholder="公分"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xl font-bold text-slate-700 ml-4">體重 (kg)</label>
            <input 
              type="number" 
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
              placeholder="公斤"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xl font-bold text-slate-700 ml-4">受測者代碼 / Email 身分識別</label>
          <input 
            type="text" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-6 rounded-[30px] border-4 border-slate-100 focus:border-blue-500 outline-none text-2xl font-bold"
            placeholder="例如：A001 或 user@mail.com"
            required
          />
        </div>

        {error && <p className="text-red-500 text-center font-bold text-xl">{error}</p>}

        <div className="flex flex-col space-y-4 pt-4">
          <button 
            type="submit"
            className="w-full py-6 bg-blue-600 text-white text-3xl font-black rounded-[40px] shadow-2xl active:scale-95 transition"
          >
            註冊
          </button>
          <button 
            type="button"
            onClick={onGoToLogin}
            className="w-full py-4 text-blue-600 text-xl font-bold"
          >
            已經有帳號了？立即登入
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterView;
