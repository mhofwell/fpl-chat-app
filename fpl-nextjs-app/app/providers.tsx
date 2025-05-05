// app/providers.tsx
'use client';

import { ReactNode } from 'react';
import { PreferencesProvider } from '@/providers/preferences-provider';
import { SessionProvider } from '@/providers/session-provider';

export function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <PreferencesProvider>{children}</PreferencesProvider>
        </SessionProvider>
    );
}
