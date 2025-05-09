'use client';

import {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
    useCallback,
} from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Session, User } from '@supabase/supabase-js';

interface SessionContextType {
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    error: string | null;
    refreshSession: () => Promise<void>;
    signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
    session: null,
    user: null,
    isLoading: true,
    error: null,
    refreshSession: async () => {},
    signOut: async () => {},
});

export function useSession() {
    return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const router = useRouter();
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSession = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error } = await supabase.auth.getSession();

            if (error) throw error;

            setSession(data.session);
            setUser(data.session?.user || null);
        } catch (err) {
            console.error('Error loading session:', err);
            setError('Failed to load user session');
        } finally {
            setIsLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        loadSession();

        // Set up auth state change listener
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user || null);
            router.refresh();
        });

        // Clean up subscription when component unmounts
        return () => {
            subscription.unsubscribe();
        };
    }, [supabase, router, loadSession]);

    const refreshSession = async () => {
        if (session) {
            setIsLoading(true);
            try {
                const { data, error } = await supabase.auth.refreshSession();
                if (error) throw error;
                setSession(data.session);
                setUser(data.session?.user || null);
            } catch (err) {
                console.error('Error refreshing session:', err);
                setError('Failed to refresh session');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            router.push('/sign-in');
        } catch (err) {
            console.error('Error signing out:', err);
            setError('Failed to sign out');
        }
    };

    return (
        <SessionContext.Provider
            value={{
                session,
                user,
                isLoading,
                error,
                refreshSession,
                signOut,
            }}
        >
            {children}
        </SessionContext.Provider>
    );
}
