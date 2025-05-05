// types/fpl-api-responses.ts
export interface FplTeam {
    id: number;
    name: string;
    short_name: string;
    code: number;
    form: string | null;
    played: number;
    points: number;
    position: number;
    strength: number;
    strength_attack_home: number;
    strength_attack_away: number;
    strength_defence_home: number;
    strength_defence_away: number;
}

export interface FplElement {
    id: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    element_type: number;
    form: string;
    points_per_game: string;
    total_points: number;
    selected_by_percent: string;
    now_cost: number;
    status: string;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    chance_of_playing_next_round: number | null;
    news: string | null;
}

export interface FplEvent {
    id: number;
    name: string;
    deadline_time: string;
    is_current: boolean;
    is_next: boolean;
    finished: boolean;
    data_checked: boolean;
    highest_scoring_entry: number | null;
    most_selected: number | null;
    most_transferred_in: number | null;
    top_element: number | null;
    top_element_info: {
        id: number;
        points: number;
    } | null;
    most_captained: number | null;
}

export interface FplFixture {
    id: number;
    code: number;
    event: number | null;
    finished: boolean;
    kickoff_time: string | null;
    minutes: number;
    started: boolean;
    team_a: number;
    team_a_score: number | null;
    team_h: number;
    team_h_score: number | null;
    team_h_difficulty: number;
    team_a_difficulty: number;
    stats: {
        identifier: string;
        a: { value: number; element: number }[];
        h: { value: number; element: number }[];
    }[];
}

export interface BootstrapStaticResponse {
    teams: FplTeam[];
    elements: FplElement[];
    events: FplEvent[];
    element_types: {
        id: number;
        singular_name: string;
        singular_name_short: string;
        plural_name: string;
        plural_name_short: string;
    }[];
}

export interface PlayerHistory {
    element: number;
    fixture: number;
    opponent_team: number;
    total_points: number;
    was_home: boolean;
    kickoff_time: string;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    value: number;
}

export interface PlayerHistoryPast {
    season_name: string;
    element_code: number;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    start_cost: number;
    end_cost: number;
}

export interface PlayerDetailResponse {
    fixtures: {
        id: number;
        team_h: number;
        team_a: number;
        event: number;
        kickoff_time: string;
        is_home: boolean;
        difficulty: number;
    }[];
    history: PlayerHistory[];
    history_past: PlayerHistoryPast[];
}

export interface GameweekLiveResponse {
    elements: {
        [key: string]: {
            id: number;
            stats: {
                minutes: number;
                goals_scored: number;
                assists: number;
                clean_sheets: number;
                goals_conceded: number;
                own_goals: number;
                penalties_saved: number;
                penalties_missed: number;
                yellow_cards: number;
                red_cards: number;
                saves: number;
                bonus: number;
                bps: number;
                total_points: number;
            };
        };
    };
}
