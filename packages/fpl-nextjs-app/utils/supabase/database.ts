// utils/supabase/database.ts
import { createClient } from '@/utils/supabase/server';
import { Cache, CacheTypes } from '@/types/supabase';

/**
 * Fetch teams from the database with optional caching
 */
export async function fetchTeams(cache?: Cache) {
    const supabase = await createClient();

    // Check cache if provided
    if (cache?.has(CacheTypes.TEAMS)) {
        return cache.get(CacheTypes.TEAMS);
    }

    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching teams:', error);
        throw new Error(`Failed to fetch teams: ${error.message}`);
    }

    // Store in cache if provided
    if (cache) {
        cache.set(CacheTypes.TEAMS, data);
    }

    return data;
}

/**
 * Fetch players from the database with optional caching and filtering
 */
export async function fetchPlayers(options?: {
    teamId?: number;
    position?: string;
    cache?: Cache;
}) {
    const supabase = await createClient();
    const { teamId, position, cache } = options || {};

    // Generate cache key for specific filters
    const cacheKey = teamId
        ? `${CacheTypes.PLAYERS}_TEAM_${teamId}`
        : position
          ? `${CacheTypes.PLAYERS}_POS_${position}`
          : CacheTypes.PLAYERS;

    // Check cache if provided
    if (cache?.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let query = supabase
        .from('players')
        .select('*, teams(name, short_name)')
        .order('web_name');

    if (teamId) {
        query = query.eq('team_id', teamId);
    }

    if (position) {
        query = query.eq('position', position);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching players:', error);
        throw new Error(`Failed to fetch players: ${error.message}`);
    }

    // Store in cache if provided
    if (cache) {
        cache.set(cacheKey, data);
    }

    return data;
}

/**
 * Fetch current gameweek information
 */
export async function fetchCurrentGameweek(cache?: Cache) {
    const supabase = await createClient();

    // Check cache if provided
    if (cache?.has(CacheTypes.CURRENT_GAMEWEEK)) {
        return cache.get(CacheTypes.CURRENT_GAMEWEEK);
    }

    const { data, error } = await supabase
        .from('gameweeks')
        .select('*')
        .eq('is_current', true)
        .single();

    if (error) {
        console.error('Error fetching current gameweek:', error);
        throw new Error(`Failed to fetch current gameweek: ${error.message}`);
    }

    // Store in cache if provided
    if (cache) {
        cache.set(CacheTypes.CURRENT_GAMEWEEK, data);
    }

    return data;
}

/**
 * Fetch fixtures for a specific gameweek
 */
export async function fetchFixtures(gameweekId: number, cache?: Cache) {
    const supabase = await createClient();

    // Create cache key for specific gameweek
    const cacheKey = `${CacheTypes.FIXTURES}_GW_${gameweekId}`;

    // Check cache if provided
    if (cache?.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const { data, error } = await supabase
        .from('fixtures')
        .select(
            `
      *,
      home_team:home_team_id(id, name, short_name),
      away_team:away_team_id(id, name, short_name)
    `
        )
        .eq('gameweek_id', gameweekId)
        .order('kickoff_time');

    if (error) {
        console.error('Error fetching fixtures:', error);
        throw new Error(`Failed to fetch fixtures: ${error.message}`);
    }

    // Store in cache if provided
    if (cache) {
        cache.set(cacheKey, data);
    }

    return data;
}

/**
 * User profile operations
 */
export async function getUserProfile() {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return null;
    }

    // Get the user's profile
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }

    return data;
}

export async function updateUserProfile(updates: {
    username?: string;
    full_name?: string;
    avatar_url?: string;
}) {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('User not authenticated');
    }

    // Update the user's profile
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Error updating user profile:', error);
        throw new Error(`Failed to update profile: ${error.message}`);
    }

    return data;
}

/**
 * User preferences operations
 */
export async function getUserPreferences() {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return null;
    }

    // Get the user's preferences
    const { data, error } = await supabase
        .from('user_preferences')
        .select('*, favorite_team:favorite_team_id(id, name, short_name)')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Error fetching user preferences:', error);
        return null;
    }

    // Convert to plain object to ensure it's serializable for client components
    return data ? JSON.parse(JSON.stringify(data)) : null;
}

export async function updateUserPreferences(updates: {
    favorite_team_id?: number;
    dark_mode?: boolean;
    email_notifications?: boolean;
}) {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('User not authenticated');
    }

    // Update the user's preferences
    const { data, error } = await supabase
        .from('user_preferences')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Error updating user preferences:', error);
        throw new Error(`Failed to update preferences: ${error.message}`);
    }

    return data;
}

/**
 * Chat history operations
 */
export async function getUserChats() {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return [];
    }

    // Get the user's chats
    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching user chats:', error);
        return [];
    }

    return data;
}

export async function getChatMessages(chatId: string) {
    const supabase = await createClient();

    // Get messages for the specified chat
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching chat messages:', error);
        return [];
    }

    return data;
}

export async function createChat(title: string = 'New Chat') {
    const supabase = await createClient();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('User not authenticated');
    }

    // Create a new chat
    const { data, error } = await supabase
        .from('chats')
        .insert([{ user_id: user.id, title }])
        .select()
        .single();

    if (error) {
        console.error('Error creating chat:', error);
        throw new Error(`Failed to create chat: ${error.message}`);
    }

    return data;
}

export async function updateChatTitle(chatId: string, title: string) {
    const supabase = await createClient();

    // Update the chat title
    const { data, error } = await supabase
        .from('chats')
        .update({ title })
        .eq('id', chatId)
        .select()
        .single();

    if (error) {
        console.error('Error updating chat title:', error);
        throw new Error(`Failed to update chat title: ${error.message}`);
    }

    return data;
}

export async function deleteChat(chatId: string) {
    const supabase = await createClient();

    // Delete the chat (messages will be cascade deleted)
    const { error } = await supabase.from('chats').delete().eq('id', chatId);

    if (error) {
        console.error('Error deleting chat:', error);
        throw new Error(`Failed to delete chat: ${error.message}`);
    }

    return true;
}

export async function addMessage(
    chatId: string,
    content: string,
    role: 'user' | 'assistant'
) {
    const supabase = await createClient();

    // Add a message to the chat
    const { data, error } = await supabase
        .from('messages')
        .insert([{ chat_id: chatId, content, role }])
        .select()
        .single();

    if (error) {
        console.error('Error adding message:', error);
        throw new Error(`Failed to add message: ${error.message}`);
    }

    // Update the chat's updated_at timestamp
    await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

    return data;
}
