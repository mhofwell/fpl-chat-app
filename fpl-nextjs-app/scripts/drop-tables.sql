-- Function to completely reset the database by dropping all tables and cleaning auth.users
-- This is useful for development purposes when you need to start with a clean slate
CREATE OR REPLACE FUNCTION public.reset_database()
RETURNS VOID AS $$
BEGIN
    -- Drop storage policies first
    DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;

    -- Drop the triggers to avoid errors on table drops
    DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
    DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
    DROP TRIGGER IF EXISTS update_chats_updated_at ON chats;
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    
    -- Drop the functions that triggers depend on
    DROP FUNCTION IF EXISTS public.update_updated_at_column();
    DROP FUNCTION IF EXISTS public.handle_new_user();
    
    -- Drop tables in the correct order (messages first, then chats, etc.)
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS chats;
    DROP TABLE IF EXISTS user_preferences;
    DROP TABLE IF EXISTS profiles;
    
    -- Drop player_gameweek_stats and player_season_stats tables before players
    DROP TABLE IF EXISTS player_gameweek_stats;
    DROP TABLE IF EXISTS player_season_stats;
    
    -- Drop fixtures, players, gameweeks, teams as before
    DROP TABLE IF EXISTS fixtures;
    DROP TABLE IF EXISTS players;
    DROP TABLE IF EXISTS gameweeks;
    DROP TABLE IF EXISTS teams;
    
    -- Clean the auth.users table (only if allowed)
    -- Note: Using WHERE TRUE to satisfy the WHERE clause requirement
    DELETE FROM auth.users WHERE TRUE;
    
    -- Output success message
    RAISE NOTICE 'Database has been reset successfully!';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;