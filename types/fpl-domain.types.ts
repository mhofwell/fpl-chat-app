// shared-types/fpl-domain.types.ts

// Basic FPL data types
export interface Team {
    id: number;
    name: string;
    short_name: string;
    code?: number;

    // Performance and stats from API
    form?: string | null;
    played?: number;
    points?: number;
    position?: number;

    // Strength indicators from API
    strength?: number;
    strength_attack_home?: number;
    strength_attack_away?: number;
    strength_defence_home?: number;
    strength_defence_away?: number;

    win?: number;
    loss?: number;
    draw?: number;
    strength_overall_home?: number;
    strength_overall_away?: number;
    pulse_id?: number;

    last_updated?: string;
}

export interface Player {
    id: number;
    web_name: string;
    full_name: string;
    first_name?: string;
    second_name?: string;
    team_id: number;
    element_type?: number; // Raw position ID
    position?: string; // Mapped: GKP, DEF, MID, FWD

    // Cost
    now_cost?: number;
    cost_change_start?: number;

    // Performance
    form?: string;
    points_per_game?: string;
    total_points?: number;
    minutes?: number;
    goals_scored?: number;
    assists?: number;
    clean_sheets?: number;
    goals_conceded?: number;
    own_goals?: number;
    penalties_saved?: number;
    penalties_missed?: number;
    yellow_cards?: number;
    red_cards?: number;
    saves?: number;
    bonus?: number;
    bps?: number;

    // Status & Availability
    status?: string; // 'a', 'd', 'i', 's', 'u'
    news?: string | null;
    news_added?: string | null;
    chance_of_playing_next_round?: number | null;
    chance_of_playing_this_round?: number | null;

    // Advanced Metrics
    influence?: string;
    creativity?: string;
    threat?: string;
    ict_index?: string;

    // Expected Points
    ep_next?: string;
    ep_this?: string;

    // Other
    selected_by_percent?: string;
    transfers_in?: number;
    transfers_out?: number;
    dreamteam_count?: number;

    last_updated?: string;
}

export interface Gameweek {
    id: number;
    name: string;
    deadline_time: string;
    is_current: boolean;
    is_next: boolean;
    finished: boolean;
    last_updated?: string;
}

export interface Fixture {
    id: number;
    gameweek_id: number | null; // Represents FplFixture.event
    home_team_id: number; // Represents FplFixture.team_h
    away_team_id: number; // Represents FplFixture.team_a
    kickoff_time: string | null;
    finished: boolean;
    team_h_difficulty?: number;
    team_a_difficulty?: number;
    team_h_score?: number | null;
    team_a_score?: number | null;
    last_updated?: string;
}
