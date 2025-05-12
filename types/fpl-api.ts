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
    win: number;
    loss: number;
    draw: number;
    strength_overall_home: number;
    strength_overall_away: number;
    pulse_id: number;
    unavailable: boolean;
}

export interface FplElement {
    id: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number; // team_id
    element_type: number; // Corresponds to player position
    form: string;
    points_per_game: string;
    total_points: number;
    selected_by_percent: string;
    now_cost: number;
    cost_change_start: number;
    cost_change_event: number;
    cost_change_event_fall: number;
    cost_change_start_fall: number;
    status: string; // Player availability status e.g. 'a' (available), 'd' (doubtful), 'i' (injured), 's' (suspended), 'u' (unavailable)
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
    bps: number; // Bonus Points System
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    chance_of_playing_next_round: number | null;
    chance_of_playing_this_round: number | null;
    news: string | null;
    news_added: string | null; // Timestamp for when news was added
    transfers_in: number;
    transfers_out: number;
    dreamteam_count: number; // Number of times in the Dream Team
    ep_next: string; // Expected points next gameweek
    ep_this: string; // Expected points this gameweek
}

export interface FplElementType {
    id: number;
    singular_name: string;
    singular_name_short: string;
    plural_name: string;
    plural_name_short: string;
    squad_select?: number; // How many players of this type can be selected
    squad_min_play?: number; // Min players of this type that must play
    squad_max_play?: number; // Max players of this type that can play
    element_count?: number; // Total number of players of this type
}

export interface FplEvent {
    id: number; // Gameweek ID
    name: string; // e.g. "Gameweek 1"
    deadline_time: string;
    average_entry_score?: number; // Added from schema
    finished: boolean;
    data_checked: boolean;
    highest_scoring_entry?: number | null; // Made optional as per schema (null)
    deadline_time_epoch?: number; // Added from schema
    is_previous: boolean; // Added
    is_current: boolean;
    is_next: boolean;
    most_selected?: number | null; // Player ID, made optional
    most_transferred_in?: number | null; // Player ID, made optional
    top_element?: number | null; // Player ID of top scoring player this GW, made optional
    top_element_info?: { // Made optional
        id: number;
        points: number;
    } | null;
    most_captained?: number | null; // Player ID, made optional
}

export interface FplFixtureStatValue {
    value: number;
    element: number; // Player ID
}

export interface FplFixtureStat {
    identifier: string; // e.g., "goals_scored", "assists"
    a: FplFixtureStatValue[]; // Away team player stats for this identifier
    h: FplFixtureStatValue[]; // Home team player stats for this identifier
}

export interface FplFixture {
    id: number;
    code: number;
    event: number | null;
    finished: boolean;
    finished_provisional?: boolean;
    kickoff_time: string | null;
    minutes: number;
    started: boolean;
    team_a: number;
    team_a_score: number | null;
    team_h: number;
    team_h_score: number | null;
    team_h_difficulty: number;
    team_a_difficulty: number;
    stats: FplFixtureStat[];
    pulse_id?: number;
}

export interface BootstrapStaticResponse {
    teams: FplTeam[];
    elements: FplElement[];
    events: FplEvent[];
    element_types: FplElementType[];
}

export interface PlayerHistory { // Stats for a player in a specific past fixture
    element: number; // Player ID
    fixture: number; // Fixture ID
    opponent_team: number; // Opponent Team ID
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
    value: number; // Player's cost at the time of this fixture (x10)
    selected?: number; // Number of managers who selected this player for this gameweek
    round: number;
}

export interface PlayerHistoryPast { // Summary stats for a player in a past season
    season_name: string;
    element_code: number; // Player's code for that season (not ID)
    start_cost: number; // Player's starting cost for that season (x10)
    end_cost: number; // Player's ending cost for that season (x10)
    total_points: number;
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
    influence?: string; // Older seasons might not have these
    creativity?: string;
    threat?: string;
    ict_index?: string;
}

export interface FplDetailedPlayerFixture {
    id: number;
    code: number;
    team_h: number;
    team_h_score: number | null;
    team_a: number;
    team_a_score: number | null;
    event: number; // Gameweek ID
    finished: boolean;
    minutes: number;
    provisional_start_time: boolean;
    kickoff_time: string; // ISO date string
    event_name: string; // "Gameweek X"
    is_home: boolean;
    difficulty: number;
}

export interface FplPlayerHistory {
    element: number;
    fixture: number;
    opponent_team: number;
    total_points: number;
    was_home: boolean;
    kickoff_time: string; // ISO date string
    team_h_score: number;
    team_a_score: number;
    round: number;
    modified: boolean; // This was in one example, might not always be there
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
    starts: number;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    value: number; // Player's value at the time of this gameweek
    transfers_balance: number;
    selected: number;
    transfers_in: number;
    transfers_out: number;
    // mng_ fields if needed
}

export interface FplPlayerHistoryPast {
    season_name: string;
    element_code: number;
    start_cost: number;
    end_cost: number;
    total_points: number;
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
    starts: number;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    // mng_ fields if needed
}

export interface PlayerDetailResponse {
    fixtures: FplDetailedPlayerFixture[];
    history: FplPlayerHistory[];       // Current season's gameweek stats
    history_past: FplPlayerHistoryPast[]; // Past seasons' stats
}

export interface GameweekLivePlayerStats {
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
    starts: number;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    total_points: number;
    in_dreamteam: boolean;
    // The schema also mentions mng_ fields, but they are all 0 in the example.
    // Add them if they are ever non-zero and relevant.
    // mng_win: number;
    // mng_draw: number;
    // mng_loss: number;
    // mng_underdog_win: number;
    // mng_underdog_draw: number;
    // mng_clean_sheets: number;
    // mng_goals_scored: number;
}

export interface GameweekLivePlayerExplainStat {
    identifier: string;
    points: number;
    value: number;
    points_modification?: number; // This was in an old example, ensure it's still used. FPL schema shows it as 0.
}

export interface GameweekLivePlayerExplainFixture {
    fixture: number; // Fixture ID
    stats: GameweekLivePlayerExplainStat[];
}

export interface GameweekLiveElement {
    id: number; // Player ID
    stats: GameweekLivePlayerStats;
    explain: GameweekLivePlayerExplainFixture[];
    modified?: boolean; // The schema shows this, might indicate recent update
}

export interface GameweekLiveResponse {
    elements: GameweekLiveElement[]; // The FPL API actually returns an object where keys are player IDs, but an array is easier to work with. The service.ts will need to handle this transformation if the API returns an object.
                                  // If the API strictly returns elements as an object mapping ID to GameweekLiveElement, then:
                                  // elements: { [key: string]: GameweekLiveElement };
}
