
import { UserProfile, UserSettings, RecordMode } from '../../types';

export interface TestResult {
  id: string;
  timestamp: number;
  mode: RecordMode;
  score: number;
  duration?: number;
  details?: any;
  user?: {
    uid: string;
    email?: string;
    displayName?: string;
    age?: number;
    gender?: string;
    height?: number;
    weight?: number;
  };
  userId?: string;
}

const DB_NAME = 'VivifrailLocalDB';
const DB_VERSION = 1;

// In-memory cache for synchronous reads after async initialization
const cache = {
  users: [] as UserProfile[],
  settings: null as UserSettings | null,
  history: [] as TestResult[]
};

let db: IDBDatabase | null = null;
let isInitialized = false;

// Helper to load all keys/values from an object store
function loadAllFromStore<T>(storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    try {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });
}

// Helper to get settings (holds a single config object)
function getSettingsFromStore(): Promise<UserSettings | null> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    try {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('current');

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

// Generic helper to save an item to store asynchronously
function saveToStoreAsync<T>(storeName: string, item: T): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`Failed to put to store ${storeName}:`, request.error);
        resolve();
      };
    } catch (err) {
      console.error(err);
      resolve();
    }
  });
}

// Generic helper to save a key-value pair asynchronously
function saveKeyValueToStoreAsync<T>(storeName: string, key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`Failed to put key-value to store ${storeName}:`, request.error);
        resolve();
      };
    } catch (err) {
      console.error(err);
      resolve();
    }
  });
}

// Helper to clear entire store
function clearStoreAsync(storeName: string): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Migration from localStorage to IndexedDB
async function migrateFromLocalStorage() {
  try {
    const localUsers = localStorage.getItem('vivifrail_users');
    const localSettings = localStorage.getItem('vivifrail_settings');
    const localHistory = localStorage.getItem('vivifrail_history');

    if (localUsers) {
      const parsedUsers = JSON.parse(localUsers) as UserProfile[];
      cache.users = parsedUsers;
      for (const u of parsedUsers) {
        await saveToStoreAsync('users', u);
      }
    }
    if (localSettings) {
      const parsedSettings = JSON.parse(localSettings) as UserSettings;
      cache.settings = parsedSettings;
      await saveKeyValueToStoreAsync('settings', 'current', parsedSettings);
    }
    if (localHistory) {
      const parsedHistory = JSON.parse(localHistory) as TestResult[];
      cache.history = parsedHistory;
      for (const h of parsedHistory) {
        await saveToStoreAsync('history', h);
      }
    }
    console.log('Successfully migrated data from localStorage to IndexedDB.');
  } catch (err) {
    console.error('Error migrating data to IndexedDB:', err);
  }
}

// Async function to open the database and load data into memory
export const initDb = (): Promise<void> => {
  return new Promise((resolve) => {
    if (isInitialized) {
      resolve();
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB:', event);
      // Fallback: If IndexedDB fails to load, try to load from localStorage
      try {
        const localUsers = localStorage.getItem('vivifrail_users');
        const localSettings = localStorage.getItem('vivifrail_settings');
        const localHistory = localStorage.getItem('vivifrail_history');

        if (localUsers) cache.users = JSON.parse(localUsers);
        if (localSettings) cache.settings = JSON.parse(localSettings);
        if (localHistory) cache.history = JSON.parse(localHistory);
      } catch (err) {
        console.error('LocalStorage fallback error:', err);
      }
      isInitialized = true;
      resolve();
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      
      // Load all data from stores into memory
      Promise.all([
        loadAllFromStore<UserProfile>('users'),
        loadAllFromStore<TestResult>('history'),
        getSettingsFromStore()
      ]).then(([users, history, settings]) => {
        cache.users = users;
        cache.history = history;
        cache.settings = settings;

        // Try migrate from localStorage if IndexedDB is currently empty
        if (users.length === 0 && history.length === 0) {
          migrateFromLocalStorage().then(() => {
            isInitialized = true;
            resolve();
          });
        } else {
          isInitialized = true;
          resolve();
        }
      }).catch((err) => {
        console.error('Error loading data from IndexedDB stores:', err);
        isInitialized = true;
        resolve(); // Resolve anyway to avoid blocking SPA boot on database errors
      });
    };

    request.onupgradeneeded = (event) => {
      const upgradeDb = (event.target as IDBOpenDBRequest).result;
      
      if (!upgradeDb.objectStoreNames.contains('users')) {
        upgradeDb.createObjectStore('users', { keyPath: 'email' });
      }
      if (!upgradeDb.objectStoreNames.contains('history')) {
        upgradeDb.createObjectStore('history', { keyPath: 'id' });
      }
      if (!upgradeDb.objectStoreNames.contains('settings')) {
        upgradeDb.createObjectStore('settings');
      }
    };
  });
};

export const LocalDbService = {
  getUsers: (): UserProfile[] => {
    return cache.users;
  },

  registerUser: (profile: UserProfile) => {
    const users = LocalDbService.getUsers();
    if (users.find(u => u.email === profile.email)) throw new Error('Email already registered');
    
    // Save to cache
    users.push(profile);
    
    // Save to IndexedDB
    saveToStoreAsync('users', profile);
    
    return profile;
  },

  loginUser: (emailOrUid: string, _password?: string): UserProfile | null => {
    const users = LocalDbService.getUsers();
    const query = (emailOrUid || '').trim().toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === query || u.uid === (emailOrUid || '').trim());
    if (!user) return null;
    
    // Retain localStorage session for persistence across refresh
    localStorage.setItem('vivifrail_user', JSON.stringify(user));
    return user;
  },

  getSettings: (): UserSettings | null => {
    return cache.settings;
  },

  saveSettings: (settings: UserSettings) => {
    cache.settings = settings;
    saveKeyValueToStoreAsync('settings', 'current', settings);
  },

  getHistory: (): TestResult[] => {
    return cache.history;
  },

  getHistoryByUser: (userId: string): TestResult[] => {
    if (!userId) return [];
    return cache.history.filter(record => 
      (record.user && record.user.uid === userId) || 
      ((record as any).userId === userId)
    );
  },

  saveTestResult: (result: Omit<TestResult, 'id' | 'timestamp'>) => {
    const history = LocalDbService.getHistory();
    const newResult: TestResult = {
      ...result,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    
    // Update cache
    history.push(newResult);
    
    // Save to IndexedDB
    saveToStoreAsync('history', newResult);
    
    return newResult;
  },

  clearHistory: () => {
    cache.history = [];
    clearStoreAsync('history');
  },

  getDefaultUserLevel: (userId: string): 'A' | 'B' | 'C' | 'D' => {
    if (!userId) return 'D';
    const history = LocalDbService.getHistoryByUser(userId);
    const sppbRecords = history.filter(h => (h.mode as string) === 'sppb');
    if (sppbRecords.length > 0) {
      const latest = [...sppbRecords].sort((a,b) => b.timestamp - a.timestamp)[0];
      const score = (latest.score !== undefined) ? latest.score : ((latest.details?.balanceScore || 0) + (latest.details?.walkScore || 0) + (latest.details?.chairScore || 0));
      const walk6mTime = latest.details?.rawWalk6mTime || 0;
      const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
      
      if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) return 'A';
      if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) return 'B';
      if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) return 'C';
      return 'D';
    }
    return 'D';
  },

  getDefaultUserSubLevel: (userId: string): string => {
    if (!userId) return 'D';
    const history = LocalDbService.getHistoryByUser(userId);
    const sppbRecords = history.filter(h => (h.mode as string) === 'sppb');
    if (sppbRecords.length > 0) {
      const latest = [...sppbRecords].sort((a,b) => b.timestamp - a.timestamp)[0];
      const score = (latest.score !== undefined) ? latest.score : ((latest.details?.balanceScore || 0) + (latest.details?.walkScore || 0) + (latest.details?.chairScore || 0));
      const walk6mTime = latest.details?.rawWalk6mTime || 0;
      const walk6mSpeed = walk6mTime > 0 ? (6 / walk6mTime) : null;
      
      let lvl = 'D';
      if (score <= 3 || (walk6mSpeed !== null && walk6mSpeed < 0.5)) lvl = 'A';
      else if (score <= 6 || (walk6mSpeed !== null && walk6mSpeed <= 0.8)) lvl = 'B';
      else if (score <= 9 || (walk6mSpeed !== null && walk6mSpeed <= 1.0)) lvl = 'C';
      else lvl = 'D';

      const hasRisk = latest.details?.fallRisk?.hasRisk || (latest.details?.rawTugTime && latest.details?.rawTugTime > 20) || (latest.details?.rawWalk6mTime && latest.details?.rawWalk6mTime > 7.5);
      if (hasRisk && (lvl === 'B' || lvl === 'C')) {
        lvl += '+';
      }
      return lvl;
    }
    return 'D';
  },

  importBackup: async (backupData: { users?: UserProfile[], history?: TestResult[] }) => {
    if (backupData.users && Array.isArray(backupData.users)) {
      for (const u of backupData.users) {
        if (!cache.users.find(existing => existing.email === u.email)) {
          cache.users.push(u);
          await saveToStoreAsync('users', u);
        }
      }
    }
    if (backupData.history && Array.isArray(backupData.history)) {
      for (const h of backupData.history) {
        if (!cache.history.find(existing => existing.id === h.id)) {
          cache.history.push(h);
          await saveToStoreAsync('history', h);
        }
      }
    }
  }
};
