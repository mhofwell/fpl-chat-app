import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@/components/ui/button';

const SAMPLE_QUESTIONS = [
    'Who is the top scorer in the Premier League this season?',
    "Tell me about Manchester City's upcoming fixtures",
    'How is Erling Haaland performing in the last few gameweeks?',
    'Which defenders have the most clean sheets?',
];

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        redirect('/protected');
    }

    return (
        <div className="flex flex-col items-center justify-center px-6 gap-16 py-16">
            {/* Hero */}
            <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
                <div className="h-20 w-20 rounded-full bg-secondary ring-4 ring-primary/30 shadow-[0_0_40px_rgba(0,255,135,0.15)] flex items-center justify-center p-3">
                    <img
                        src="/fpl-assistant.png"
                        alt="ChatFPL"
                        className="h-full w-full object-contain"
                    />
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold font-header tracking-tight">
                    ChatFPL
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                    An AI-powered Fantasy Premier League assistant that grounds
                    every answer in live FPL data. Transfers, captaincy,
                    fixtures — covered.
                </p>
                <div className="flex gap-3 mt-2">
                    <Button asChild size="lg">
                        <Link href="/sign-in">Sign in</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                        <Link href="/sign-up">Create account</Link>
                    </Button>
                </div>
            </div>

            {/* Feature preview — sample questions */}
            <div className="w-full max-w-xl">
                <p className="text-sm text-muted-foreground text-center mb-4">
                    Ask about...
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SAMPLE_QUESTIONS.map((question) => (
                        <div
                            key={question}
                            className="p-3 rounded-lg border border-border bg-card text-sm text-muted-foreground"
                        >
                            {question}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
