-- Step 1: Ensure the schema exists (should already be there in Supabase)
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Set up the core FPL reference tables with selected historical data
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    short_name VARCHAR(3) NOT NULL,
    -- Add all relevant fields from FPL API's Team object
    code INTEGER,
    played INTEGER,
    form TEXT, -- Form can be null or a string like "W, D, L"
    loss INTEGER,
    points INTEGER,
    position INTEGER,
    strength INTEGER,
    team_division INTEGER, -- Usually null for PL
    unavailable BOOLEAN,
    win INTEGER,
    strength_overall_home INTEGER,
    strength_overall_away INTEGER,
    strength_attack_home INTEGER,
    strength_attack_away INTEGER,
    strength_defence_home INTEGER,
    strength_defence_away INTEGER,
    pulse_id INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    web_name VARCHAR(50) NOT NULL,
    full_name VARCHAR(100) NOT NULL, -- Concatenation of first_name and second_name
    first_name VARCHAR(50),
    second_name VARCHAR(50),
    team_id INTEGER REFERENCES teams(id),
    element_type INTEGER, -- 1:GKP, 2:DEF, 3:MID, 4:FWD
    position VARCHAR(20), -- GKP, DEF, MID, FWD (derived from element_type)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gameweeks (
    id INTEGER PRIMARY KEY,
    name VARCHAR(20),
    deadline_time TIMESTAMP WITH TIME ZONE,
    is_current BOOLEAN,
    is_next BOOLEAN,
    finished BOOLEAN,
    data_checked BOOLEAN, -- From FPL API, indicates if data for the GW is verified
    is_previous BOOLEAN,
    average_entry_score INTEGER,
    highest_score INTEGER,
    -- Add is_player_stats_synced column
    is_player_stats_synced BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN public.gameweeks.is_player_stats_synced IS 'Flag to indicate if player_gameweek_stats have been successfully synced for this gameweek.';

CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY,
    code INTEGER, -- FPL API fixture code
    gameweek_id INTEGER REFERENCES gameweeks(id), -- 'event' from FPL API
    home_team_id INTEGER REFERENCES teams(id),
    away_team_id INTEGER REFERENCES teams(id),
    kickoff_time TIMESTAMP WITH TIME ZONE,
    finished BOOLEAN,
    finished_provisional BOOLEAN,
    started BOOLEAN,
    minutes INTEGER,
    team_h_score INTEGER,
    team_a_score INTEGER,
    team_h_difficulty INTEGER,
    team_a_difficulty INTEGER,
    pulse_id INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add table for historical player performance by gameweek
CREATE TABLE IF NOT EXISTS player_gameweek_stats (
    id SERIAL PRIMARY KEY, -- Using SERIAL for auto-incrementing primary key
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    gameweek_id INTEGER REFERENCES gameweeks(id) ON DELETE CASCADE,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    influence NUMERIC(5,1) DEFAULT 0.0, -- Using NUMERIC for precision from FPL "influence": "68.2"
    creativity NUMERIC(5,1) DEFAULT 0.0,
    threat NUMERIC(5,1) DEFAULT 0.0,
    ict_index NUMERIC(5,1) DEFAULT 0.0,
    total_points INTEGER DEFAULT 0,
    -- value INTEGER, -- Player's cost at the time of this gameweek
    -- selected INTEGER, -- How many managers selected the player for this gameweek
    -- transfers_balance INTEGER,
    -- transfers_in INTEGER,
    -- transfers_out INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- To track when this specific record was last updated
    UNIQUE(player_id, gameweek_id)
);

-- Add table for season summary stats
CREATE TABLE IF NOT EXISTS player_season_stats (
    id SERIAL PRIMARY KEY, -- Using SERIAL
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    season_name VARCHAR(10) NOT NULL, -- e.g., "2023/24"
    element_code INTEGER, -- Player's code for that specific season, can change
    start_cost INTEGER, -- Cost at start of season (e.g., 55 for £5.5m)
    end_cost INTEGER, -- Cost at end of season
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    influence TEXT, -- Storing as TEXT to match FPL API string "325.0"
    creativity TEXT,
    threat TEXT,
    ict_index TEXT,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season_name)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_gameweek_id ON fixtures(gameweek_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_teams ON fixtures(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_player_gameweek_stats_player_gw ON player_gameweek_stats(player_id, gameweek_id); -- Renamed for clarity
CREATE INDEX IF NOT EXISTS idx_player_season_stats_player_season ON player_season_stats(player_id, season_name); -- Renamed for clarity

-- Step 3: Set up user profiles and user preferences tables
-- User profiles extend the auth.users table with additional information
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User preferences for FPL-specific settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    favorite_team_id INTEGER REFERENCES teams(id),
    dark_mode BOOLEAN DEFAULT FALSE,
    email_notifications BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 4: Chat-related tables (for storing conversation history)
-- Chats table to store conversation sessions
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(100) DEFAULT 'New Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table for individual messages in conversations
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    role VARCHAR(10) NOT NULL, -- 'user' or 'assistant'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for chat queries
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

-- Table for refresh logs
CREATE TABLE IF NOT EXISTS refresh_logs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  state VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on refresh_logs for better query performance
CREATE INDEX IF NOT EXISTS idx_refresh_logs_type ON refresh_logs(type);
CREATE INDEX IF NOT EXISTS idx_refresh_logs_created_at ON refresh_logs(created_at);

-- Table for system metadata (e.g., last FPL API sync time)
CREATE TABLE IF NOT EXISTS system_meta (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for dynamic cron schedule (if you implement dynamic scheduling)
CREATE TABLE IF NOT EXISTS dynamic_cron_schedule (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL, -- 'live-update', 'post-match'
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  match_ids INTEGER[], -- Array of fixture IDs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries on dynamic_cron_schedule
CREATE INDEX IF NOT EXISTS idx_dynamic_cron_schedule_job_type ON dynamic_cron_schedule(job_type);
CREATE INDEX IF NOT EXISTS idx_dynamic_cron_schedule_timerange ON dynamic_cron_schedule(start_time, end_time);

-- Create system config table
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default config values
INSERT INTO system_config (key, value, description)
VALUES
  ('enable_dynamic_scheduling', 'true', 'Enable dynamic scheduling of cron jobs based on fixture times')
ON CONFLICT (key) DO NOTHING; 

-- Step 5: Row Level Security policies to secure the data
-- Enable Row Level Security for all relevant tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Enable RLS for FPL data tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameweeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_gameweek_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;

-- Enable RLS for other tables (if needed, e.g., system_config)
ALTER TABLE public.refresh_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_cron_schedule ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can create their own profile" 
ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE USING (auth.uid() = id);

-- Create policies for user_preferences
CREATE POLICY "Users can view their own preferences" 
ON user_preferences FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can create their own preferences" 
ON user_preferences FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own preferences" 
ON user_preferences FOR UPDATE USING (auth.uid() = id);

-- Create policies for chats
CREATE POLICY "Users can view their own chats" 
ON chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own chats" 
ON chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own chats" 
ON chats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own chats" 
ON chats FOR DELETE USING (auth.uid() = user_id);

-- Create policies for messages
CREATE POLICY "Users can view messages of their own chats" 
ON messages FOR SELECT USING (auth.uid() = (SELECT user_id FROM chats WHERE id = chat_id));
CREATE POLICY "Users can insert messages to their own chats" 
ON messages FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM chats WHERE id = chat_id));

-- Policies for public FPL data tables
CREATE POLICY "Allow public read access to teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Allow public read access to players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Allow public read access to gameweeks" ON public.gameweeks FOR SELECT USING (true);
CREATE POLICY "Allow public read access to fixtures" ON public.fixtures FOR SELECT USING (true);
CREATE POLICY "Allow public read access to player_gameweek_stats" ON public.player_gameweek_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read access to player_season_stats" ON public.player_season_stats FOR SELECT USING (true);

-- Step 6: Functions and triggers for user management
-- Function to create a profile and preferences when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a profile for the new user
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  
  -- Create default preferences for the new user
  INSERT INTO public.user_preferences (id)
  VALUES (new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute handle_new_user function after user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if exists to avoid conflict
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Step 7: Create function to update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers to update the updated_at column for relevant tables
DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_players_updated_at ON public.players;
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_gameweeks_updated_at ON public.gameweeks;
CREATE TRIGGER update_gameweeks_updated_at BEFORE UPDATE ON public.gameweeks FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fixtures_updated_at ON public.fixtures;
CREATE TRIGGER update_fixtures_updated_at BEFORE UPDATE ON public.fixtures FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_player_gameweek_stats_updated_at ON public.player_gameweek_stats;
CREATE TRIGGER update_player_gameweek_stats_updated_at BEFORE UPDATE ON public.player_gameweek_stats FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_player_season_stats_updated_at ON public.player_season_stats;
CREATE TRIGGER update_player_season_stats_updated_at BEFORE UPDATE ON public.player_season_stats FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chats_updated_at ON public.chats;
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_meta_updated_at ON public.system_meta;
CREATE TRIGGER update_system_meta_updated_at BEFORE UPDATE ON public.system_meta FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_config_updated_at ON public.system_config;
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- Create storage bucket for avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public, 
  file_size_limit = EXCLUDED.file_size_limit, 
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- Set up storage policies for avatars
-- Ensure old policies are dropped before creating new ones to avoid conflicts
DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
CREATE POLICY "Users can view all avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
-- More specific: WITH CHECK (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid ); 
-- if you store avatars in user-id named folders.
-- For simplicity, allowing any auth user to upload to 'avatars' bucket. Can be refined.

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid ) -- Assuming avatars stored in folders named by user ID
WITH CHECK (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid );

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid ); -- Assuming avatars stored in folders named by user ID