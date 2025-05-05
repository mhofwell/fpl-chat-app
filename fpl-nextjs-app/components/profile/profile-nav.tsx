'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const items = [
    {
        title: 'Dashboard',
        href: '/protected',
    },
    {
        title: 'Profile',
        href: '/protected/profile',
    },
    {
        title: 'Chat',
        href: '/chat',
    },
];

export function ProfileNav() {
    const pathname = usePathname();

    return (
        <nav className="flex gap-6 mb-6">
            {items.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                        'text-sm font-medium transition-colors hover:text-primary',
                        pathname === item.href
                            ? 'text-foreground border-b-2 border-green-600 pb-1'
                            : 'text-muted-foreground'
                    )}
                >
                    {item.title}
                </Link>
            ))}
        </nav>
    );
}
