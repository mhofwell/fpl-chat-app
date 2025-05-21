// scripts/clean-duplicate-messages.ts
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanDuplicateMessages() {
  console.log('Starting duplicate message cleanup...');
  
  try {
    // Get all chats
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select('id');
      
    if (chatsError) {
      console.error('Error fetching chats:', chatsError);
      return;
    }
    
    console.log(`Found ${chats?.length || 0} chats to process`);
    
    let totalDuplicatesRemoved = 0;
    
    // Process each chat
    for (const chat of chats || []) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true });
        
      if (messagesError) {
        console.error(`Error fetching messages for chat ${chat.id}:`, messagesError);
        continue;
      }
      
      if (!messages || messages.length === 0) continue;
      
      // Find consecutive duplicates
      const duplicateIds: string[] = [];
      
      for (let i = 1; i < messages.length; i++) {
        const current = messages[i];
        const previous = messages[i - 1];
        
        // Check if consecutive messages are identical (same role and content)
        if (current.role === previous.role && 
            current.content === previous.content &&
            Math.abs(new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) < 5000) { // Within 5 seconds
          duplicateIds.push(current.id);
        }
      }
      
      if (duplicateIds.length > 0) {
        console.log(`Chat ${chat.id}: Found ${duplicateIds.length} duplicate messages`);
        
        // Delete duplicates
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .in('id', duplicateIds);
          
        if (deleteError) {
          console.error(`Error deleting duplicates for chat ${chat.id}:`, deleteError);
        } else {
          totalDuplicatesRemoved += duplicateIds.length;
          console.log(`Chat ${chat.id}: Removed ${duplicateIds.length} duplicates`);
        }
      }
    }
    
    console.log(`\nCleanup complete. Total duplicates removed: ${totalDuplicatesRemoved}`);
    
  } catch (error) {
    console.error('Error in cleanup:', error);
  }
}

// Run the cleanup
cleanDuplicateMessages();