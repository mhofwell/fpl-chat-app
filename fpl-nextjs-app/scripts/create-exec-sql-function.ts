// scripts/create-exec-sql-function.ts
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function createExecSqlFunction() {
    console.log('Creating exec_sql function...');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }

    // Create client with admin role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        db: { schema: 'public' }
    });
    
    try {
        const sqlContent = fs.readFileSync(
            path.join(process.cwd(), 'scripts', 'exec_sql_function.sql'),
            'utf8'
        );
        
        // Use the service role key to execute SQL directly
        console.log('Using service role to create function...');
        
        // Execute raw SQL using the SQL editor endpoint
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                query: sqlContent
            })
        });
        
        if (response.ok) {
            console.log('Function creation request successful!');
        } else {
            // If direct REST API doesn't work, provide instructions
            console.log('\n================================================');
            console.log('MANUAL STEPS REQUIRED');
            console.log('================================================');
            console.log('Please create the exec_sql function manually:');
            console.log('');
            console.log('1. Go to your Supabase dashboard');
            console.log('2. Navigate to the SQL Editor');
            console.log('3. Copy and paste this SQL:');
            console.log('');
            console.log(sqlContent);
            console.log('');
            console.log('4. Run the SQL query');
            console.log('5. After creating the function, run: npm run setup:database');
            console.log('================================================\n');
            return;
        }
        
        // Test the function
        console.log('Testing exec_sql function...');
        const { error: testError } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
        
        if (testError) {
            console.error('Function not accessible yet. You may need to:');
            console.log('1. Wait a few seconds for the function to be available');
            console.log('2. Check the Supabase dashboard to ensure it was created');
            console.log('3. Run setup-database.ts again');
        } else {
            console.log('exec_sql function tested successfully!');
            console.log('You can now run: npm run setup:database');
        }
        
    } catch (error) {
        console.error('Error creating function:', error);
        console.log('\n================================================');
        console.log('MANUAL STEPS REQUIRED');
        console.log('================================================');
        console.log('Please create the exec_sql function manually:');
        console.log('');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to the SQL Editor');
        console.log('3. Copy and paste this SQL:');
        console.log('');
        const sqlContent = fs.readFileSync(
            path.join(process.cwd(), 'scripts', 'exec_sql_function.sql'),
            'utf8'
        );
        console.log(sqlContent);
        console.log('');
        console.log('4. Run the SQL query');
        console.log('5. After creating the function, run: npm run setup:database');
        console.log('================================================\n');
    }
}

// Run the function
createExecSqlFunction()
    .then(() => {
        console.log('Process completed.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });