// components/layout/protected-nav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, User, MessageSquare } from 'lucide-react';

export default function ProtectedNav() {
    const pathname = usePathname();

    const navItems = [
        { href: '/protected', label: 'Home', icon: Home },
        { href: '/chat', label: 'Chat', icon: MessageSquare },
        { href: '/protected/profile', label: 'Profile', icon: User },
        {
            href: '/protected/preferences',
            label: 'Preferences',
            icon: Settings,
        },
    ];

    return (
        <nav className="py-4 mb-6">
            <ul className="flex flex-wrap gap-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                                    isActive
                                        ? 'bg-green-100 text-green-700'
                                        : 'hover:bg-gray-100'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{item.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
