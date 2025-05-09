// scripts/drop-tables.ts
import dotenv from 'dotenv';
import { createSupabaseAdmin, executeSQL } from '../utils/sql-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Create Supabase client with service role key for admin access
const supabase = createSupabaseAdmin();

async function dropTables() {
    console.log('DANGER: About to drop all database tables...');
    console.log('This will completely remove all data and schema!');

    // Prompt for confirmation in production environments
    if (process.env.NODE_ENV === 'production') {
        console.log('You are in PRODUCTION environment!');
        console.log('Please type "DROP ALL TABLES" to confirm:');

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const answer = await new Promise((resolve) => {
            readline.question('> ', resolve);
        });

        readline.close();

        if (answer !== 'DROP ALL TABLES') {
            console.log('Operation cancelled.');
            process.exit(0);
        }
    }

    try {
        const fs = require('fs');
        const path = require('path');

        // Execute the SQL file directly
        const sqlContent = fs.readFileSync(
            path.join(process.cwd(), 'scripts', 'drop-tables.sql'),
            'utf8'
        );
        const { error: scriptError } = await executeSQL(supabase, sqlContent);

        if (scriptError) {
            console.error('Error executing drop-tables.sql:', scriptError);
            throw scriptError;
        }

        // Then execute the function
        const { error } = await executeSQL(
            supabase,
            'SELECT reset_database();'
        );

        if (error) {
            console.error('Error dropping tables:', error);
        } else {
            console.log('All database tables dropped successfully!');
        }
    } catch (error) {
        console.error('Error during table dropping:', error);
        throw error;
    }
}

// Run the drop tables function
dropTables()
    .then(() => {
        console.log(
            'Tables dropped. Run setup-database.ts to recreate the schema.'
        );
        process.exit(0);
    })
    .catch((error) => {
        console.error('Unhandled error during drop operation:', error);
        process.exit(1);
    });
