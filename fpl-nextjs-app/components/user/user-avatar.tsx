'use client';

import { useSession } from '@/providers/session-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface UserAvatarProps {
    profile?: any;
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
}

export default function UserAvatar({ profile, size = 'md', showStatus = false }: UserAvatarProps) {
    const { user } = useSession();
    const userProfile = profile || (user ? {
        avatar_url: user.user_metadata?.avatar_url,
        username: user.user_metadata?.username || user.email,
        full_name: user.user_metadata?.full_name
    } : null);
    
    // Determine the size classes
    const sizeClasses = {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-16 w-16'
    };
    
    // Generate initials for avatar fallback
    const getInitials = () => {
        if (userProfile?.full_name) {
            return userProfile.full_name
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        return userProfile?.username?.substring(0, 2).toUpperCase() || 'U';
    };

    return (
        <div className="relative">
            <Avatar className={sizeClasses[size]}>
                <AvatarImage 
                    src={userProfile?.avatar_url} 
                    alt={userProfile?.username || userProfile?.full_name || 'User'} 
                />
                <AvatarFallback className="bg-green-600 text-white">
                    {getInitials()}
                </AvatarFallback>
            </Avatar>
            
            {showStatus && (
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
            )}
        </div>
    );
} 