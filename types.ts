
export enum AppStep {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  MAIN_MENU = 'MAIN_MENU',
  HISTORY = 'HISTORY',
  SURVEY_MENU = 'SURVEY_MENU',
  SURVEY_FALL_RISK = 'SURVEY_FALL_RISK',
  SURVEY_ICOPE = 'SURVEY_ICOPE',
  GAME_MENU = 'GAME_MENU',
  GAME_OBSTACLE_CONFIG = 'GAME_OBSTACLE_CONFIG',
  GAME_OBSTACLE_RACE = 'GAME_OBSTACLE_RACE',
  GAME_BOXING_CONFIG = 'GAME_BOXING_CONFIG',
  GAME_BOXING_EXEC = 'GAME_BOXING_EXEC',
  GAME_SOCCER_CONFIG = 'GAME_SOCCER_CONFIG',
  GAME_SOCCER_EXEC = 'GAME_SOCCER_EXEC',
  GAME_BUBBLE_CONFIG = 'GAME_BUBBLE_CONFIG',
  GAME_BUBBLE_EXEC = 'GAME_BUBBLE_EXEC',
  GAME = 'GAME',
  HOME = 'HOME',
  SELECTION = 'SELECTION',
  POSITIONING = 'POSITIONING',
  // Test 1: Balance
  T1_PARALLEL_INTRO = 'T1_PARALLEL_INTRO',
  T1_PARALLEL_EXEC = 'T1_PARALLEL_EXEC',
  T1_SEMI_INTRO = 'T1_SEMI_INTRO',
  T1_SEMI_EXEC = 'T1_SEMI_EXEC',
  T1_TANDEM_INTRO = 'T1_TANDEM_INTRO',
  T1_TANDEM_EXEC = 'T1_TANDEM_EXEC',
  // Test 2: Walk
  T2_WALK_INTRO = 'T2_WALK_INTRO',
  T2_WALK_EXEC = 'T2_WALK_EXEC',
  // Test 3: Chair Stand
  T3_CHAIR_INTRO = 'T3_CHAIR_INTRO',
  T3_CHAIR_EXEC = 'T3_CHAIR_EXEC',
  // Test 4: TUG
  T4_TUG_INTRO = 'T4_TUG_INTRO',
  T4_TUG_EXEC = 'T4_TUG_EXEC',
  // Test 5: 6m Walk
  T5_WALK6M_INTRO = 'T5_WALK6M_INTRO',
  T5_WALK6M_EXEC = 'T5_WALK6M_EXEC',
  RESULTS = 'RESULTS'
}

export type RecordMode =
  | 'sppb'
  | 'boxing'
  | 'bubble'
  | 'soccer'
  | 'obstacle_race'
  | 'fall_risk'
  | 'icope';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  age: number;
  height: number;
  weight: number;
  gender: 'male' | 'female' | 'other';
  createdAt: number;
}

export interface FallRiskSurvey {
  recentFalls: boolean;
  cognitiveDecline: boolean;
  hasRisk: boolean;
}

export interface IcopeSurvey {
  cognitive_memory: boolean;
  cognitive_orientation1: boolean;
  cognitive_orientation2: boolean;
  cognitive_choices: string[];
  nutrition_weight: boolean;
  nutrition_appetite: boolean;
  vision_diabetes: boolean;
  vision_eyesight: boolean;
  vision_checkup: boolean;
  depression_annoyed: boolean;
  depression_activities: boolean;
  hearing_repeat: boolean;
  medicine_count: boolean;
  medicine_types: boolean;
  medicine_side_effects: boolean;
  mobility_chair_time: number;
  hasIssues: {
    cognitive: boolean;
    nutrition: boolean;
    vision: boolean;
    depression: boolean;
    hearing: boolean;
    medicine: boolean;
    mobility: boolean;
  };
}

export interface TestResult {
  balanceScore: number; // 0-4
  walkScore: number;    // 0-4
  chairScore: number;   // 0-4
  rawBalanceSideBySide: number;
  rawBalanceSemiTandem: number;
  rawBalanceTandem: number;
  walkTrial1: number;   // First attempt
  walkTrial2: number;   // Second attempt
  rawWalkTime: number;  // Best of two
  rawChairTime: number;
  rawTugTime: number;
  rawWalk6mTime: number;
  chairReps?: { id: number, duration: number, timestamp: number }[];
  timestamp: number;
  userId: string;
  fallRisk?: FallRiskSurvey;
}

export const INITIAL_RESULTS: TestResult = {
  balanceScore: 0,
  walkScore: 0,
  chairScore: 0,
  rawBalanceSideBySide: 0,
  rawBalanceSemiTandem: 0,
  rawBalanceTandem: 0,
  walkTrial1: 0,
  walkTrial2: 0,
  rawWalkTime: 0,
  rawChairTime: 0,
  rawTugTime: 0,
  rawWalk6mTime: 0,
  timestamp: 0,
  userId: ''
};

export interface UserSettings {
  fontSize: number;
  highContrast: boolean;
  voiceAssist: boolean;
  layout: 'landscape' | 'portrait';
}

export interface SelectedTests {
  balance: boolean;
  walk: boolean;
  chair: boolean;
  tug: boolean;
  walk6m: boolean;
}
