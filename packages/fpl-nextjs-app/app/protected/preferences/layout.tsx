// app/protected/preferences/layout.tsx
import ProtectedNav from '@/components/layout/protected-nav';

export default function PreferencesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="container max-w-4xl mx-auto p-4">
            <ProtectedNav />
            {children}
        </div>
    );
}
