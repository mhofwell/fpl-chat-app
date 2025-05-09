'use client';

import { updateProfileAction } from '@/app/actions/auth';
import { uploadAvatarAction } from '@/app/actions/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ProfileFormProps {
    profile: any;
    user: any;
}

export default function ProfileForm({ profile, user }: ProfileFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(
        profile?.avatar_url
    );

    async function handleSubmit(formData: FormData) {
        setIsSubmitting(true);
        await updateProfileAction(formData);
        setIsSubmitting(false);
        router.refresh();
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setAvatarPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);

        // Upload file
        setIsUploading(true);
        const formData = new FormData();
        formData.append('avatar', file);
        await uploadAvatarAction(formData);
        setIsUploading(false);
        router.refresh();
    }

    // Generate initials for avatar fallback
    const getInitials = () => {
        if (profile?.full_name) {
            return profile.full_name
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        return profile?.username?.substring(0, 2).toUpperCase() || 'U';
    };

    return (
        <form action={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative group">
                    <Avatar className="h-24 w-24 border-2 border-gray-200">
                        <AvatarImage
                            src={avatarPreview || undefined}
                            alt={profile?.username || 'User'}
                        />
                        <AvatarFallback className="text-lg bg-green-600 text-white">
                            {getInitials()}
                        </AvatarFallback>
                    </Avatar>

                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                        <label
                            htmlFor="avatar-upload"
                            className="cursor-pointer text-white text-xs font-medium p-1"
                        >
                            {isUploading ? 'Uploading...' : 'Change'}
                        </label>
                    </div>

                    <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                        disabled={isUploading}
                    />
                </div>

                <div className="flex-1 space-y-2">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            defaultValue={user?.email || ''}
                            disabled
                            className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">
                            Your email cannot be changed
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                        id="username"
                        name="username"
                        type="text"
                        defaultValue={profile?.username || ''}
                        placeholder="Enter a username"
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                        id="full_name"
                        name="full_name"
                        type="text"
                        defaultValue={profile?.full_name || ''}
                        placeholder="Enter your full name"
                    />
                </div>
            </div>

            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Profile'}
            </Button>
        </form>
    );
}
