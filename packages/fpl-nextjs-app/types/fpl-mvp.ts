// types/fpl-mvp.ts

// Core FPL API types for MVP
export interface FPLElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number; // 1=GKP, 2=DEF, 3=MID, 4=FWD
  
  // Real statistics
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  minutes: number;
  
  // FPL game data
  total_points: number;
  now_cost: number; // Price in tenths (e.g., 100 = £10.0)
  selected_by_percent: string;
  form: string;
  points_per_game: string;
  
  // Status
  status: string;
  news: string | null;
  news_added: string | null;
}

export interface FPLTeam {
  id: number;
  name: string;
  short_name: string;
  code: number;
  position: number;
  played: number;
  points: number;
  form: string | null;
  win: number;
  draw: number;
  loss: number;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
}

export interface FPLFixture {
  id: number;
  code: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  started: boolean;
  stats: Array<{
    identifier: string;
    h: Array<{ value: number; element: number }>;
    a: Array<{ value: number; element: number }>;
  }>;
}

export interface FPLBootstrapData {
  elements: FPLElement[];
  teams: FPLTeam[];
  events: FPLEvent[];
  element_types: ElementType[];
}

export interface FPLEvent {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  finished: boolean;
}

export interface ElementType {
  id: number;
  singular_name: string;
  singular_name_short: string;
  plural_name: string;
  plural_name_short: string;
}

// MVP Tool Response Types
export interface LeagueLeader {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  team: string;
  teamShort: string;
  position: string;
  value: number;
  gamesPlayed: number;
  minutesPlayed: number;
  perGame?: string;
  form?: string;
  price?: number;
  selectedBy?: string;
  news?: string | null;
  status?: string;
  stats?: {
    goals: number;
    assists: number;
    cleanSheets: number;
    saves: number;
    yellowCards: number;
    redCards: number;
    minutes: number;
  };
}

export interface PlayerStats {
  player: {
    id: number;
    name: string;
    fullName: string;
    team: string;
    position: string;
  };
  currentSeason: {
    goals: number;
    assists: number;
    cleanSheets: number;
    saves: number;
    yellowCards: number;
    redCards: number;
    minutes: number;
    gamesPlayed: number;
    goalsPerGame: string;
    assistsPerGame: string;
    minutesPerGame: number;
  };
  fplData: {
    totalPoints: number;
    currentPrice: number;
    selectedBy: string;
    form: string;
    pointsPerGame: string;
  };
  availability: {
    status: string;
    news: string | null;
    newsAdded: string | null;
  };
  form?: PlayerForm;
}

export interface PlayerForm {
  last5Games: Array<{
    gameweek: number;
    points: number;
    goals: number;
    assists: number;
    minutes: number;
  }>;
  averagePoints: number;
  totalGoals: number;
  totalAssists: number;
}

export interface SearchPlayerResult {
  id: number;
  name: string;
  team: string;
  position: string;
  stats: {
    goals: number;
    assists: number;
    minutes: number;
    gamesPlayed: number;
    goalsPerGame: string;
    assistsPerGame: string;
  };
  fpl: {
    points: number;
    price: number;
    selectedBy: string;
    form: string;
  };
  availability: {
    status: string;
    news: string | null;
  };
}

// Name matching types
export interface MatchResult {
  type: 'exact' | 'fuzzy_matches' | 'disambiguation_needed' | 'not_found';
  playerId?: number;
  options?: number[];
  suggestions?: Array<{
    name: string;
    playerIds: number[];
    confidence: number;
  }>;
  message?: string;
}

// Cache strategy types
export interface CacheTTL {
  LIVE_MATCH: {
    fixtures: number;
    live_gameweek: number;
    player_stats: number;
  };
  REGULAR: {
    bootstrap_static: number;
    fixtures: number;
    player_details: number;
    team_stats: number;
  };
}

// API rate limiting
export interface APILimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  batchSize: number;
  batchDelay: number;
}