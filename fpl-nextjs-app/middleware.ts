import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
    try {
        // Create an unmodified response
        let response = NextResponse.next({
            request: {
                headers: request.headers,
            },
        });

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value)
                        );
                        response = NextResponse.next({
                            request,
                        });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            response.cookies.set(name, value, options)
                        );
                    },
                },
            }
        );

        // Refresh session if it exists
        const {
            data: { session },
        } = await supabase.auth.getSession();

        // Additional security checks
        const path = request.nextUrl.pathname;
        const isAuthRoute =
            path.startsWith('/sign-in') ||
            path.startsWith('/sign-up') ||
            path === '/forgot-password';
        const isApiRoute = path.startsWith('/api/');
        // Make homepage and chat-related paths public
        const isPublicRoute = 
            path === '/' || 
            path.startsWith('/auth/callback') ||
            path.startsWith('/api/mcp');

        // If there's no session and the route is protected
        if (!session && path.startsWith('/protected')) {
            const redirectUrl = new URL('/sign-in', request.url);
            redirectUrl.searchParams.set('redirect', path);
            return NextResponse.redirect(redirectUrl);
        }

        // If there is a session but user is on auth routes, redirect to dashboard
        if (session && isAuthRoute) {
            return NextResponse.redirect(new URL('/protected', request.url));
        }

        // Add session timeout check (e.g., if session is older than a certain duration)
        if (session) {
            // Use session.expires_at or session.expires_in instead
            const expiresAt = new Date(session.expires_at! * 1000);
            const currentTime = new Date();
            const sessionAgeInHours =
                (expiresAt.getTime() - currentTime.getTime()) /
                (1000 * 60 * 60);

            // If session expires in less than 1 hour, try to refresh
            if (sessionAgeInHours < 1) {
                // Try to refresh the token
                const { error } = await supabase.auth.refreshSession();

                // If refresh fails, redirect to login
                if (error && !isPublicRoute && !isApiRoute) {
                    // Clear cookies
                    response.cookies.set('sb-access-token', '', { maxAge: 0 });
                    response.cookies.set('sb-refresh-token', '', { maxAge: 0 });

                    const redirectUrl = new URL('/sign-in', request.url);
                    return NextResponse.redirect(redirectUrl);
                }
            }
        }

        return response;
    } catch (e) {
        console.error('Middleware error:', e);
        // Default to public routes on error
        return NextResponse.next({
            request: {
                headers: request.headers,
            },
        });
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
