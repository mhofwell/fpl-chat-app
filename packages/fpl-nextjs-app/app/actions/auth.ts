'use server';

import { encodedRedirect } from '@/utils/utils';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { updateUserProfile } from '@/utils/supabase/database';

// Helper function to get the appropriate origin based on environment
const getOrigin = () => {
    // Check if we're in development mode based on APP_ENV
    const isDevelopment =
        (process.env.APP_ENV || 'development') === 'development';

    // Use NEXT_PUBLIC_URL if explicitly set
    if (process.env.NEXT_PUBLIC_URL) {
        return process.env.NEXT_PUBLIC_URL;
    }

    // Otherwise, use environment-specific defaults
    return isDevelopment
        ? 'http://localhost:3000' // Local development URL
        : `https://${process.env.NEXT_PUBLIC_URL}`; // Production URL
};

export const signUpAction = async (formData: FormData) => {
    const email = formData.get('email')?.toString();
    const password = formData.get('password')?.toString();
    const full_name = formData.get('full_name')?.toString() || null;

    const supabase = await createClient();
    const origin = getOrigin();

    if (!email || !password) {
        return encodedRedirect(
            'error',
            '/sign-up',
            'Email and password are required'
        );
    }

    // Include full_name in the metadata if provided
    const metadata = full_name ? { full_name } : {};

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
            data: metadata,
        },
    });

    if (error) {
        console.error(error.code + ' ' + error.message);
        return encodedRedirect('error', '/sign-up', error.message);
    } else {
        return encodedRedirect(
            'success',
            '/sign-up',
            'Thanks for signing up! Please check your email for a verification link.'
        );
    }
};

export const signInAction = async (formData: FormData) => {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return encodedRedirect('error', '/sign-in', error.message);
    }

    return redirect('/protected');
};

export const forgotPasswordAction = async (formData: FormData) => {
    const email = formData.get('email')?.toString();
    const supabase = await createClient();
    const origin = getOrigin();
    const callbackUrl = formData.get('callbackUrl')?.toString();

    if (!email) {
        return encodedRedirect(
            'error',
            '/forgot-password',
            'Email is required'
        );
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
    });

    if (error) {
        console.error(error.message);
        return encodedRedirect(
            'error',
            '/forgot-password',
            'Could not reset password'
        );
    }

    if (callbackUrl) {
        return redirect(callbackUrl);
    }

    return encodedRedirect(
        'success',
        '/forgot-password',
        'Check your email for a link to reset your password.'
    );
};

export const resetPasswordAction = async (formData: FormData) => {
    const supabase = await createClient();

    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!password || !confirmPassword) {
        return encodedRedirect(
            'error',
            '/protected/reset-password',
            'Password and confirm password are required'
        );
    }

    if (password !== confirmPassword) {
        return encodedRedirect(
            'error',
            '/protected/reset-password',
            'Passwords do not match'
        );
    }

    const { error } = await supabase.auth.updateUser({
        password: password,
    });

    if (error) {
        return encodedRedirect(
            'error',
            '/protected/reset-password',
            'Password update failed'
        );
    }

    return encodedRedirect(
        'success',
        '/protected/reset-password',
        'Password updated'
    );
};

export const signOutAction = async () => {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return redirect('/sign-in');
};

// This is all new

/**
 * Update user profile information
 */
export const updateProfileAction = async (formData: FormData) => {
    const supabase = await createClient();

    const username = formData.get('username')?.toString();
    const full_name = formData.get('full_name')?.toString();

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return encodedRedirect(
            'error',
            '/protected/profile',
            'You must be signed in to update your profile.'
        );
    }

    // First update the user metadata if full_name was provided
    if (full_name) {
        const { error: userUpdateError } = await supabase.auth.updateUser({
            data: { full_name },
        });

        if (userUpdateError) {
            return encodedRedirect(
                'error',
                '/protected/profile',
                'Failed to update user metadata: ' + userUpdateError.message
            );
        }
    }

    // Then update the profile record
    const updates = {
        ...(username && { username }),
        ...(full_name && { full_name }),
    };

    if (Object.keys(updates).length > 0) {
        const { error: profileUpdateError } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id);

        if (profileUpdateError) {
            return encodedRedirect(
                'error',
                '/protected/profile',
                'Failed to update profile: ' + profileUpdateError.message
            );
        }
    }

    return encodedRedirect(
        'success',
        '/protected/profile',
        'Profile updated successfully.'
    );
};

/**
 * Update user preferences
 */
export const updatePreferencesAction = async (formData: FormData) => {
    const supabase = await createClient();

    const favorite_team_id = formData.get('favorite_team_id')?.toString();
    const dark_mode = formData.get('dark_mode') === 'true';
    const email_notifications = formData.get('email_notifications') === 'true';

    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return encodedRedirect(
            'error',
            '/protected/preferences',
            'You must be signed in to update your preferences.'
        );
    }

    // Update the preferences record
    const updates = {
        ...(favorite_team_id && {
            favorite_team_id: parseInt(favorite_team_id),
        }),
        dark_mode,
        email_notifications,
    };

    const { error } = await supabase
        .from('user_preferences')
        .update(updates)
        .eq('id', user.id);

    if (error) {
        return encodedRedirect(
            'error',
            '/protected/preferences',
            'Failed to update preferences: ' + error.message
        );
    }

    return encodedRedirect(
        'success',
        '/protected/preferences',
        'Preferences updated successfully.'
    );
};

export const uploadAvatarAction = async (formData: FormData) => {
    const supabase = await createClient();
    
    const avatar = formData.get('avatar') as File;
    
    if (!avatar) {
        return encodedRedirect(
            'error',
            '/protected/profile',
            'No avatar file provided'
        );
    }
    
    // Get the current user
    const {
        data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
        return encodedRedirect(
            'error',
            '/protected/profile',
            'You must be signed in to update your avatar.'
        );
    }
    
    // Generate a unique filename
    const fileExt = avatar.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    
    // Upload the file to Supabase Storage
    const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatar, {
            upsert: true,
            contentType: avatar.type,
        });
    
    if (uploadError) {
        return encodedRedirect(
            'error',
            '/protected/profile',
            'Failed to upload avatar: ' + uploadError.message
        );
    }
    
    // Get the public URL
    const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
    
    const avatarUrl = publicUrlData.publicUrl;
    
    // Update the user's profile with the new avatar URL
    try {
        await updateUserProfile({
            avatar_url: avatarUrl,
        });
        
        return encodedRedirect(
            'success',
            '/protected/profile',
            'Avatar updated successfully.'
        );
    } catch (error: any) {
        return encodedRedirect(
            'error',
            '/protected/profile',
            'Failed to update profile with new avatar: ' + error.message
        );
    }
};
