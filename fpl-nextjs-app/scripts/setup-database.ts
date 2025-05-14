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

        // Check if exec_sql function exists or if it's in the schema cache
        console.log('Checking for exec_sql function...');
        let functionAvailable = false;
        
        try {
            // First try to use the function
            const { error: testError } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
            
            if (!testError) {
                functionAvailable = true;
            } else if (testError.code === 'PGRST202') {
                // Function might exist but not in schema cache
                console.log('exec_sql function not found in schema cache.');
                console.log('This usually happens after creating the function.');
                console.log('The function exists but Supabase needs to refresh its schema cache.');
                console.log('');
                
                // Provide manual alternative
                console.log('ALTERNATIVE: You can run the migration directly:');
                console.log('1. Go to your Supabase dashboard');
                console.log('2. Navigate to the SQL Editor');
                console.log('3. Copy the contents of scripts/migration.sql');
                console.log('4. Paste and run it in the SQL Editor');
                console.log('');
                console.log('OR try running this command to refresh the schema:');
                console.log('   npx supabase db reset --linked');
                console.log('');
                console.log('Then run npm run db:setup again.');
                console.log('');
                
                // Show the exec_sql function creation for reference
                console.log('Make sure the exec_sql function exists by running:');
                const execSqlContent = fs.readFileSync(
                    path.join(process.cwd(), 'scripts', 'exec_sql_function.sql'),
                    'utf8'
                );
                console.log(execSqlContent);
                process.exit(1);
            }
        } catch (error) {
            functionAvailable = false;
        }

        if (!functionAvailable) {
            console.log('\n================================================');
            console.log('IMPORTANT: exec_sql function not accessible!');
            console.log('================================================');
            console.log('The exec_sql function needs to be created or made accessible.');
            console.log('\nPlease follow these steps:');
            console.log('1. Go to your Supabase dashboard');
            console.log('2. Navigate to the SQL Editor');
            console.log('3. Run this SQL:\n');
            
            const execSqlContent = fs.readFileSync(
                path.join(process.cwd(), 'scripts', 'exec_sql_function.sql'),
                'utf8'
            );
            console.log(execSqlContent);
            console.log('\n================================================');
            console.log('After creating the function, run this script again.');
            console.log('================================================\n');
            process.exit(1);
        }

        console.log('exec_sql function is accessible, continuing with setup...');

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
            
            if (error.code === 'PGRST202') {
                console.log('\n================================================');
                console.log('Schema cache issue detected!');
                console.log('================================================');
                console.log('The exec_sql function exists but the schema cache is out of date.');
                console.log('');
                console.log('Please try one of these solutions:');
                console.log('1. Wait a few minutes for the schema cache to refresh');
                console.log('2. Run: npx supabase db reset --linked');
                console.log('3. Manually run the migration.sql in Supabase SQL Editor');
                console.log('================================================\n');
            }
            
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
