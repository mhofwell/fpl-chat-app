import { ProfileNav } from '@/components/profile/profile-nav';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return redirect('/sign-in');
    }

    return (
        <div className="max-w-5xl mx-auto p-6">
            <ProfileNav />
            {children}
        </div>
    );
}
