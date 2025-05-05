import Link from 'next/link';
import { Button } from '@/components/ui/button';
import HeaderAuth from '@/components/header-auth';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';

export default function Navbar() {
    return (
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
            <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
                <div className="flex gap-5 items-center font-semibold">
                    <Link href="/" className="text-lg font-bold">
                        FPL Chat Assistant
                    </Link>
                    <div className="hidden md:flex items-center gap-4">
                        <Link href="/" className="hover:text-primary">
                            Home
                        </Link>
                        <Link href="/protected" className="hover:text-primary">
                            Dashboard
                        </Link>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <ThemeSwitcher />
                    {!hasEnvVars ? null : <HeaderAuth />}
                </div>
            </div>
        </nav>
    );
}
