import type { NextConfig } from "next";

// Next.js natively loads .env, .env.local, .env.production, etc. from this
// directory. No dotenv import needed, and no reaching up into the monorepo
// root — each app owns its own env config.
//
// Public env vars (exposed to the browser) must be prefixed NEXT_PUBLIC_ and
// set in apps/web/.env.local:
//
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//   NEXT_PUBLIC_AGENT_SERVER_URL=...   # Python backend URL (wired up in M6)

const nextConfig: NextConfig = {};

export default nextConfig;
