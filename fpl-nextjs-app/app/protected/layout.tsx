// app/protected/layout.tsx
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { PreferencesProvider } from '@/providers/preferences-provider';
import Navbar from '@/components/layout/navbar';

export default async function ProtectedLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return redirect('/sign-in');
    }

    return (
        <PreferencesProvider>
            <div className="w-full flex flex-col min-h-screen">
                <Navbar />
                <div className="flex-1 w-full flex flex-col items-center">
                    <div className="w-full max-w-5xl px-4 py-8">
                        {children}
                    </div>
                </div>
            </div>
        </PreferencesProvider>
    );
}
