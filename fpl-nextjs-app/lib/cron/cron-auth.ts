import { NextRequest } from 'next/server';

export async function checkCronSecret(request: NextRequest): Promise<boolean> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const cronSecret = process.env.CRON_SECRET;

    return token === cronSecret;
}
