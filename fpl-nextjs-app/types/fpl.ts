// Basic FPL data types
export interface Team {
    id: number;
    name: string;
    short_name: string;
    last_updated?: string;
}

export interface Player {
    id: number;
    web_name: string;
    full_name: string;
    team_id: number;
    position: string;
    last_updated?: string;

    // Additional properties from API
    first_name?: string;
    second_name?: string;
    element_type?: number;
    form?: string;
    points_per_game?: string;
    total_points?: number;
    selected_by_percent?: string;
    
    // Stats
    goals_scored?: number;
    assists?: number;
    clean_sheets?: number;
    minutes?: number;
    yellow_cards?: number;
    red_cards?: number;
    saves?: number;
    bonus?: number;
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
    gameweek_id: number;
    home_team_id: number;
    away_team_id: number;
    kickoff_time: string;
    finished: boolean;
    last_updated?: string;

    // Additional API properties
    event?: number;
    team_h?: number;
    team_a?: number;
}
