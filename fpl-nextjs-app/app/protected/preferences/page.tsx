// app/protected/preferences/page.tsx
import { Metadata } from 'next';
import PreferencesForm from '@/components/preferences/preferences-form';

export const metadata: Metadata = {
    title: 'FPL Chat - User Preferences',
    description: 'Customize your Fantasy Premier League chat experience',
};

export default function PreferencesPage() {
    return (
        <div className="container max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold text-green-700 mb-6">
                User Preferences
            </h1>

            <PreferencesForm />
        </div>
    );
}
