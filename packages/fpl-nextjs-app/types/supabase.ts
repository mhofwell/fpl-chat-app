// types/supabase.ts
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            teams: {
                Row: {
                    id: number;
                    name: string;
                    short_name: string;
                    last_updated: string | null;
                };
                Insert: {
                    id: number;
                    name: string;
                    short_name: string;
                    last_updated?: string | null;
                };
                Update: {
                    id?: number;
                    name?: string;
                    short_name?: string;
                    last_updated?: string | null;
                };
                Relationships: [];
            };
            players: {
                Row: {
                    id: number;
                    web_name: string;
                    full_name: string;
                    team_id: number | null;
                    position: string | null;
                    last_updated: string | null;
                };
                Insert: {
                    id: number;
                    web_name: string;
                    full_name: string;
                    team_id?: number | null;
                    position?: string | null;
                    last_updated?: string | null;
                };
                Update: {
                    id?: number;
                    web_name?: string;
                    full_name?: string;
                    team_id?: number | null;
                    position?: string | null;
                    last_updated?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'players_team_id_fkey';
                        columns: ['team_id'];
                        referencedRelation: 'teams';
                        referencedColumns: ['id'];
                    },
                ];
            };
            gameweeks: {
                Row: {
                    id: number;
                    name: string | null;
                    deadline_time: string | null;
                    is_current: boolean | null;
                    is_next: boolean | null;
                    finished: boolean | null;
                    last_updated: string | null;
                };
                Insert: {
                    id: number;
                    name?: string | null;
                    deadline_time?: string | null;
                    is_current?: boolean | null;
                    is_next?: boolean | null;
                    finished?: boolean | null;
                    last_updated?: string | null;
                };
                Update: {
                    id?: number;
                    name?: string | null;
                    deadline_time?: string | null;
                    is_current?: boolean | null;
                    is_next?: boolean | null;
                    finished?: boolean | null;
                    last_updated?: string | null;
                };
                Relationships: [];
            };
            fixtures: {
                Row: {
                    id: number;
                    gameweek_id: number | null;
                    home_team_id: number | null;
                    away_team_id: number | null;
                    kickoff_time: string | null;
                    finished: boolean | null;
                    last_updated: string | null;
                };
                Insert: {
                    id: number;
                    gameweek_id?: number | null;
                    home_team_id?: number | null;
                    away_team_id?: number | null;
                    kickoff_time?: string | null;
                    finished?: boolean | null;
                    last_updated?: string | null;
                };
                Update: {
                    id?: number;
                    gameweek_id?: number | null;
                    home_team_id?: number | null;
                    away_team_id?: number | null;
                    kickoff_time?: string | null;
                    finished?: boolean | null;
                    last_updated?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'fixtures_home_team_id_fkey';
                        columns: ['home_team_id'];
                        referencedRelation: 'teams';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'fixtures_away_team_id_fkey';
                        columns: ['away_team_id'];
                        referencedRelation: 'teams';
                        referencedColumns: ['id'];
                    },
                ];
            };
            profiles: {
                Row: {
                    id: string;
                    username: string | null;
                    full_name: string | null;
                    avatar_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    username?: string | null;
                    full_name?: string | null;
                    avatar_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    username?: string | null;
                    full_name?: string | null;
                    avatar_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'profiles_id_fkey';
                        columns: ['id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            user_preferences: {
                Row: {
                    id: string;
                    favorite_team_id: number | null;
                    dark_mode: boolean;
                    email_notifications: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    favorite_team_id?: number | null;
                    dark_mode?: boolean;
                    email_notifications?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    favorite_team_id?: number | null;
                    dark_mode?: boolean;
                    email_notifications?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'user_preferences_id_fkey';
                        columns: ['id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'user_preferences_favorite_team_id_fkey';
                        columns: ['favorite_team_id'];
                        referencedRelation: 'teams';
                        referencedColumns: ['id'];
                    },
                ];
            };
            chats: {
                Row: {
                    id: string;
                    user_id: string | null;
                    title: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id?: string | null;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string | null;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'chats_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'users';
                        referencedColumns: ['id'];
                    },
                ];
            };
            messages: {
                Row: {
                    id: string;
                    chat_id: string;
                    content: string;
                    role: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    chat_id: string;
                    content: string;
                    role: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    chat_id?: string;
                    content?: string;
                    role?: string;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'messages_chat_id_fkey';
                        columns: ['chat_id'];
                        referencedRelation: 'chats';
                        referencedColumns: ['id'];
                    },
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
}

// types/cache.ts
export enum CacheTypes {
    TEAMS = 'teams',
    PLAYERS = 'players',
    FIXTURES = 'fixtures',
    CURRENT_GAMEWEEK = 'current_gameweek',
}

export interface Cache {
    has(key: string): boolean;
    get<T>(key: string): T | null;
    set<T>(key: string, value: T, ttl?: number): void;
    delete(key: string): void;
    clear(): void;
}
