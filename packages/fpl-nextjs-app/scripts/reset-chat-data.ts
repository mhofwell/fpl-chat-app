// scripts/reset-chat-data.ts
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetChatData() {
  console.log('WARNING: This will delete ALL chat messages and conversations!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Delete all messages first (due to foreign key constraints)
    console.log('Deleting all messages...');
    const { error: messagesError, count: messagesCount } = await supabase
      .from('messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything
      
    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      return;
    }
    console.log(`Deleted ${messagesCount} messages`);
    
    // Delete all chats
    console.log('Deleting all chats...');
    const { error: chatsError, count: chatsCount } = await supabase
      .from('chats')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything
      
    if (chatsError) {
      console.error('Error deleting chats:', chatsError);
      return;
    }
    console.log(`Deleted ${chatsCount} chats`);
    
    console.log('\n✅ Successfully reset all chat data');
    console.log('The application is now ready for fresh conversations without duplicates.');
    
  } catch (error) {
    console.error('Error resetting chat data:', error);
  }
}

// Run the reset
resetChatData();