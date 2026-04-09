import HeaderAuth from '@/components/header-auth';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Inter, Outfit } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import Link from 'next/link';
import './globals.css';

const defaultUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

export const metadata = {
    metadataBase: new URL(defaultUrl),
    title: 'Your FPL Assistant',
    description:
        'AI-powered Fantasy Premier League assistant to help with your FPL decisions',
};

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
});

const outfit = Outfit({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-outfit',
});

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${inter.variable} ${outfit.variable} font-sans`}
            suppressHydrationWarning
        >
            <body className="bg-background text-foreground flex flex-col min-h-screen">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem={true}
                    disableTransitionOnChange
                >
                    <div className="flex flex-col min-h-screen">
                        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-nav-border h-16 bg-nav/95 backdrop-blur-sm shrink-0 px-4 sm:px-6 lg:px-8">
                            <div className="flex items-center space-x-2">
                                <Link
                                    href="/"
                                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                                >
                                    <div className="h-10 w-10 rounded-full bg-secondary ring-2 ring-primary/20 flex items-center justify-center p-1.5">
                                        <img
                                            src="/fpl-assistant.png"
                                            alt="FPL Assistant"
                                            className="h-full w-full object-contain"
                                        />
                                    </div>
                                </Link>
                                <div className="flex items-center gap-x-4">
                                    <Link
                                        href="/"
                                        className="text-xl font-bold font-header hover:text-muted-foreground transition-colors"
                                    >
                                        Chat FPL
                                    </Link>
                                </div>
                            </div>
                            <div className="flex items-center gap-x-4">
                                <ThemeSwitcher />
                                <HeaderAuth />
                            </div>
                        </nav>
                        <div className="fixed top-16 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none z-40" />
                        <main className="flex flex-col overflow-hidden pt-16 h-screen [&>*]:h-full">
                            {children}
                        </main>
                        {/* <footer className="w-full flex items-center justify-center border-t border-nav-border bg-nav text-center text-xs gap-8 py-8 shrink-0"></footer> */}
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
