import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { ChatTransitionContainer } from '@/components/chat/chat-transition-container';

const SAMPLE_QUESTIONS = [
    "Who is the top scorer in the Premier League this season?",
    "Tell me about Manchester City's upcoming fixtures",
    'How is Erling Haaland performing in the last few gameweeks?',
    'Which defenders have the most clean sheets?',
];

export default async function ProtectedPage() {
    const supabase = await createClient();

    // getUser() re-validates the JWT against Supabase Auth (vs getSession()
    // which reads the cookie without validation). We don't pass the token
    // through props — the client reads it fresh from the browser client
    // per turn so refreshes are transparent.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return redirect('/sign-in');
    }

    const displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        user.email?.split('@')[0] ||
        'You';
    const initials = displayName
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <div className="w-full h-full">
            <ChatTransitionContainer
                sampleQuestions={SAMPLE_QUESTIONS}
                title="Let's make some picks"
                subtitle="How can I help this season?"
                userName={displayName}
                userInitials={initials}
            />
        </div>
    );
}
