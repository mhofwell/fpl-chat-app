// providers/preferences-provider.tsx
'use client';

import {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
} from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Team {
    id: number;
    name: string;
    short_name: string;
}

interface Preferences {
    id: string;
    favorite_team_id: number | null;
    dark_mode: boolean;
    email_notifications: boolean;
    favorite_team?: Team | null;
}

interface PreferencesContextType {
    preferences: Preferences | null;
    isLoading: boolean;
    error: string | null;
    refreshPreferences: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType>({
    preferences: null,
    isLoading: true,
    error: null,
    refreshPreferences: async () => {},
});

export function usePreferences() {
    return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState<Preferences | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Create client-side Supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const loadPreferences = async () => {
        try {
            setIsLoading(true);
            setError(null);
            
            // Get the current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                setPreferences(null);
                return;
            }
            
            // Get the user's preferences
            const { data, error } = await supabase
                .from('user_preferences')
                .select('*, favorite_team:favorite_team_id(id, name, short_name)')
                .eq('id', user.id)
                .single();
                
            if (error) {
                console.error('Error fetching user preferences:', error);
                setError('Failed to load user preferences');
                return;
            }
            
            // Use plain object to ensure it's serializable
            setPreferences(data);
        } catch (err) {
            console.error('Error loading preferences:', err);
            setError('Failed to load user preferences');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadPreferences();
    }, []);

    const refreshPreferences = async () => {
        await loadPreferences();
    };

    return (
        <PreferencesContext.Provider
            value={{
                preferences,
                isLoading,
                error,
                refreshPreferences,
            }}
        >
            {children}
        </PreferencesContext.Provider>
    );
}
