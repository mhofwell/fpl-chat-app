import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createSupabaseAdmin, executeSQL } from '../utils/sql-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Create Supabase client using utility function
const supabase = createSupabaseAdmin();

async function clearDatabaseData() {
    console.log('Starting database data clearing process...');
    
    try {
        // Prompt for confirmation in production environments
        if (process.env.NODE_ENV === 'production') {
            console.log('You are in PRODUCTION environment!');
            console.log('Please type "CLEAR ALL DATA" to confirm:');
            
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            
            const answer = await new Promise((resolve) => {
                readline.question('> ', resolve);
            });
            
            readline.close();
            
            if (answer !== 'CLEAR ALL DATA') {
                console.log('Operation cancelled.');
                process.exit(0);
            }
        }

        // Step 1: Execute the SQL file to create/update the function
        const sqlFilePath = path.join(process.cwd(), 'scripts', 'clear-database-data.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        const { error: createFunctionError } = await executeSQL(supabase, sqlContent);
        if (createFunctionError) {
            console.error('Error creating function:', createFunctionError);
            throw createFunctionError;
        }
        
        // Step 2: Call the function
        const { error: executeFunctionError } = await executeSQL(
            supabase, 
            'SELECT public.clear_database_data();'
        );
        
        if (executeFunctionError) {
            console.error('Error executing clear_database_data function:', executeFunctionError);
            throw executeFunctionError;
        }
        
        console.log('Database data cleared successfully!');
    } catch (error) {
        console.error('Error during database data clearing:', error);
        throw error;
    }
}

// Run the clear function
clearDatabaseData()
    .then(() => {
        console.log('Data clearing completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Unhandled error during data clearing:', error);
        process.exit(1);
    }); 