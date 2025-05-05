// app/layout.tsx (modified to add our Providers)
import { Geist } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { SessionProvider } from '@/providers/session-provider';
import { PreferencesProvider } from '@/providers/preferences-provider';
import { SessionTimeoutModal } from '@/components/session/session-timeout-modal';
import { Providers } from './providers';
import { initializeFplService } from '@/lib/fpl-api/initialize';

const defaultUrl = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000';

export const metadata = {
    metadataBase: new URL(defaultUrl),
    title: 'FPL Chat Assistant',
    description:
        'Get instant answers to all your FPL questions - stats, players, strategies, and more',
};

const geistSans = Geist({
    display: 'swap',
    subsets: ['latin'],
});


// this is a problem we have to create a route or execute this not at the module level
// Only run the initialization in a server environment
// if (typeof window === 'undefined') {
//     // Run async but don't wait for it to complete to avoid blocking app startup
//     initializeFplService().catch((err) =>
//         console.error(
//             'Failed to initialize FPL service during app startup:',
//             err
//         )
//     );
// }

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={geistSans.className}
            suppressHydrationWarning
        >
            <body className="bg-background text-foreground">
                <SessionProvider>
                    <PreferencesProvider>
                        <ThemeProvider
                            attribute="class"
                            defaultTheme="system"
                            enableSystem
                            disableTransitionOnChange
                        >
                            <Providers>
                                <main className="min-h-screen flex flex-col">
                                    {children}
                                    <SessionTimeoutModal />
                                </main>
                            </Providers>
                        </ThemeProvider>
                    </PreferencesProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
