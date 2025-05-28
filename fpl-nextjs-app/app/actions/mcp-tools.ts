// app/actions/mcp-tools.ts
'use server';

import { createClient } from '@/utils/supabase/server';

// Re-export the new MCP client functions for backward compatibility
export { 
    getMcpClient as initializeMcpSession,
    callMcpTool,
    listMcpTools,
    closeMcpClient
} from '@/lib/mcp/client';

export async function getUserChats() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    return { success: !error, chats: data };
}

export async function getChatMessages(chatId: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    return { success: !error, messages: data };
}
