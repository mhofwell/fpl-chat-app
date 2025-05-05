import { createClient } from '@/utils/supabase/server';
import { updateUserProfile } from '@/utils/supabase/database';
import { encodedRedirect } from '@/utils/utils';

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

    try {
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
            console.error('Avatar upload error:', uploadError);
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
        await updateUserProfile({
            avatar_url: avatarUrl,
        });

        return encodedRedirect(
            'success',
            '/protected/profile',
            'Avatar updated successfully.'
        );
    } catch (error: any) {
        console.error('Avatar action error:', error);
        return encodedRedirect(
            'error',
            '/protected/profile',
            'Failed to update profile with new avatar: ' + error.message
        );
    }
};
