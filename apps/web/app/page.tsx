import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        redirect('/protected');
    }

    return (
        <div className="min-h-[70vh] w-full flex flex-col items-center justify-center px-6 text-center gap-8">
            <div className="flex flex-col items-center gap-4">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    FPL Coach
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                    A Fantasy Premier League assistant that grounds every answer in live
                    FPL data. Transfers, captaincy, fixtures — covered.
                </p>
            </div>
            <div className="flex gap-3">
                <Button asChild size="lg">
                    <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                    <Link href="/sign-up">Create account</Link>
                </Button>
            </div>
        </div>
    );
}
