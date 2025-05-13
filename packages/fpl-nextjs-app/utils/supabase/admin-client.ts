  // packages/fpl-nextjs-app/utils/supabase/admin-client.ts
  import { createClient as createSupabaseJsClient, SupabaseClient } from '@supabase/supabase-js';

  export const createAdminSupabaseClient = (): SupabaseClient => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl) {
          throw new Error('Supabase URL (NEXT_PUBLIC_SUPABASE_URL) is not defined in environment variables.');
      }
      if (!supabaseServiceKey) {
          throw new Error('Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY) is not defined in environment variables.');
      }

      // Create and return a new client instance
      return createSupabaseJsClient(supabaseUrl, supabaseServiceKey);
  };