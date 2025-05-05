import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * Parse SQL content with support for dollar-quoted string literals
 * @param sql The SQL content to parse
 * @returns Array of SQL statements
 */
export function parseSqlWithDollarQuotes(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarTag = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        currentStatement += char;

        if (char === '$' && (i === 0 || sql[i - 1] !== '\\')) {
            if (!inDollarQuote) {
                const tagEnd = sql.indexOf('$', i + 1);
                if (tagEnd !== -1) {
                    dollarTag = sql.substring(i, tagEnd + 1);
                    inDollarQuote = true;
                }
            } else if (
                sql.substring(i - dollarTag.length + 1, i + 1) === dollarTag
            ) {
                inDollarQuote = false;
            }
        }

        if (char === ';' && !inDollarQuote) {
            statements.push(currentStatement.trim());
            currentStatement = '';
        }
    }

    if (currentStatement.trim()) statements.push(currentStatement.trim());
    return statements;
}

/**
 * Execute a single SQL statement using Supabase RPC
 * @param supabase Supabase client
 * @param sql SQL statement to execute
 * @returns Result of execution
 */
export async function executeSQL(supabase: SupabaseClient, sql: string) {
    try {
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) console.error('Error:', error);
        return { error };
    } catch (error) {
        console.error('Exception:', error);
        throw error;
    }
}

/**
 * Read and execute an SQL file with support for dollar-quoted string literals
 * @param supabase Supabase client
 * @param filePath Path to the SQL file relative to the scripts directory
 * @param delay Optional delay between statements in milliseconds
 */
export async function executeSqlFile(
    supabase: SupabaseClient,
    filePath: string
) {
    console.log(`Executing ${filePath}...`);
    const sqlContent = fs.readFileSync(
        path.join(process.cwd(), 'scripts', filePath),
        'utf8'
    );
    
    // Execute the entire script in one go
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
        console.error('Error executing SQL file:', error);
        throw error;
    }
}

/**
 * Create a Supabase client with service role key for admin access
 * @returns Supabase client
 */
export function createSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}
