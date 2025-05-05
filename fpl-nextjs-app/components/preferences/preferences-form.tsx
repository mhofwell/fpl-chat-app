// components/preferences/preferences-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUserPreferences, fetchTeams } from '@/utils/supabase/database';
import { updatePreferencesAction } from '@/app/actions/auth';

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

export default function PreferencesForm() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [preferences, setPreferences] = useState<Preferences | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [message, setMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    // Load user preferences and teams on component mount
    useEffect(() => {
        async function loadData() {
            try {
                const [userPrefs, teamsList] = await Promise.all([
                    getUserPreferences(),
                    fetchTeams(),
                ]);

                setPreferences(userPrefs);
                setTeams(teamsList as Team[]);
            } catch (error) {
                console.error('Error loading preferences data:', error);
                setMessage({
                    type: 'error',
                    text: 'Failed to load preferences. Please try again.',
                });
            } finally {
                setIsLoading(false);
            }
        }

        loadData();

        // Check for URL params that might contain success/error messages
        const url = new URL(window.location.href);
        const status = url.searchParams.get('status');
        const message = url.searchParams.get('message');

        if (status && message) {
            setMessage({
                type: status as 'success' | 'error',
                text: message,
            });

            // Clear the URL params
            url.searchParams.delete('status');
            url.searchParams.delete('message');
            window.history.replaceState({}, '', url);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setMessage(null);

        const form = e.currentTarget;
        const formData = new FormData(form);

        try {
            await updatePreferencesAction(formData);
            router.refresh(); // Refresh the page data
        } catch (error) {
            console.error('Error updating preferences:', error);
            setMessage({
                type: 'error',
                text: 'Failed to update preferences. Please try again.',
            });
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700"></div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">FPL Preferences</h2>

            {message && (
                <div
                    className={`p-3 mb-4 rounded-md ${
                        message.type === 'success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                    }`}
                >
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label
                        htmlFor="favorite_team_id"
                        className="block mb-2 font-medium"
                    >
                        Favorite Team
                    </label>
                    <select
                        id="favorite_team_id"
                        name="favorite_team_id"
                        className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        defaultValue={preferences?.favorite_team_id || ''}
                    >
                        <option value="">Select a team</option>
                        {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                                {team.name}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-sm text-gray-500">
                        This helps us personalize your FPL chat experience.
                    </p>
                </div>

                <div className="mb-4">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="dark_mode"
                            name="dark_mode"
                            defaultChecked={preferences?.dark_mode}
                            value="true"
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                        />
                        <label
                            htmlFor="dark_mode"
                            className="ml-2 block font-medium"
                        >
                            Dark Mode
                        </label>
                    </div>
                    <p className="mt-1 ml-6 text-sm text-gray-500">
                        Enable dark mode for a more comfortable viewing
                        experience.
                    </p>
                </div>

                <div className="mb-6">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="email_notifications"
                            name="email_notifications"
                            defaultChecked={preferences?.email_notifications}
                            value="true"
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                        />
                        <label
                            htmlFor="email_notifications"
                            className="ml-2 block font-medium"
                        >
                            Email Notifications
                        </label>
                    </div>
                    <p className="mt-1 ml-6 text-sm text-gray-500">
                        Receive email updates about FPL deadlines and team news.
                    </p>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        Save Preferences
                    </button>
                </div>
            </form>
        </div>
    );
}
