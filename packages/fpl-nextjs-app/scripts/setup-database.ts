// scripts/setup-database.ts
import dotenv from 'dotenv';
import { createSupabaseAdmin, executeSQL } from '../utils/sql-utils';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Process command line arguments
const args = process.argv.slice(2);
const shouldClearData = args.includes('--clear-data');

// Create Supabase client using utility function
const supabase = createSupabaseAdmin();

async function clearDatabaseData() {
    console.log('Clearing database data...');
    try {
        // Execute the clear-database-data.sql file without parsing
        console.log('Executing clear-database-data.sql...');
        const { error: scriptError } = await executeSQL(
            supabase,
            fs.readFileSync(
                path.join(process.cwd(), 'scripts', 'clear-database-data.sql'),
                'utf8'
            )
        );

        if (scriptError) {
            console.error(
                'Error executing clear-database-data.sql:',
                scriptError
            );
            throw scriptError;
        }

        // Then execute the function
        const { error } = await executeSQL(
            supabase,
            'SELECT clear_database_data();'
        );

        if (error) {
            console.error('Error clearing database data:', error);
        } else {
            console.log('Database data cleared successfully!');
        }
    } catch (error) {
        console.error('Error during database data clearing:', error);
        throw error;
    }
}

async function setupDatabase() {
    console.log('Starting database setup process...');

    try {
        // Clear data if requested
        if (shouldClearData) {
            await clearDatabaseData();
        }

        // Execute the exec_sql_function.sql first
        console.log('Creating exec_sql function...');
        const { error: funcError } = await executeSQL(
            supabase,
            fs.readFileSync(
                path.join(process.cwd(), 'scripts', 'exec_sql_function.sql'),
                'utf8'
            )
        );

        if (funcError) {
            console.error('Error creating exec_sql function:', funcError);
            throw funcError;
        }

        // Execute the migration SQL file without parsing
        console.log('Executing migration.sql...');
        const { error } = await executeSQL(
            supabase,
            fs.readFileSync(
                path.join(process.cwd(), 'scripts', 'migration.sql'),
                'utf8'
            )
        );

        if (error) {
            console.error('Error executing migration SQL:', error);
            throw error;
        }

        console.log('Database setup completed successfully!');
    } catch (error) {
        console.error('Error during database setup:', error);
        process.exit(1);
    }
}

// Run the setup function
setupDatabase()
    .then(() => {
        console.log(
            'Setup process completed. Now you can run seed-database.ts to populate with data.'
        );
        process.exit(0);
    })
    .catch((error) => {
        console.error('Unhandled error during setup:', error);
        process.exit(1);
    });
