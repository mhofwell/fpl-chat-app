// components/chat/chat-sidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import {
    getUserChats,
    createChat,
    deleteChat,
} from '@/utils/supabase/database';
import { Plus, Trash2 } from 'lucide-react';

interface Chat {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

interface ChatSidebarProps {
    activeChatId: string | null;
    onSelectChat: (chatId: string) => void;
    onNewChat: () => void;
}

export default function ChatSidebar({
    activeChatId,
    onSelectChat,
    onNewChat,
}: ChatSidebarProps) {
    const [chats, setChats] = useState<Chat[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadChats() {
            try {
                const userChats = await getUserChats();
                setChats(userChats);
            } catch (error) {
                console.error('Error loading chats:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadChats();
    }, []);

    const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this chat?')) {
            try {
                await deleteChat(chatId);
                setChats(chats.filter((chat) => chat.id !== chatId));
                if (chatId === activeChatId) {
                    onNewChat();
                }
            } catch (error) {
                console.error('Error deleting chat:', error);
            }
        }
    };

    return (
        <div className="w-64 h-full bg-gray-100 border-r overflow-y-auto">
            <div className="p-4">
                <button
                    onClick={onNewChat}
                    className="w-full p-2 flex items-center justify-center gap-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                    <Plus className="h-5 w-5" />
                    <span>New Chat</span>
                </button>
            </div>

            <div className="px-3 py-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Your Conversations
                </h2>
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    </div>
                ) : chats.length === 0 ? (
                    <div className="text-sm text-gray-500 p-4 text-center">
                        No conversations yet
                    </div>
                ) : (
                    <ul className="mt-2 space-y-1">
                        {chats.map((chat) => (
                            <li
                                key={chat.id}
                                className={`flex items-center justify-between p-2 text-sm rounded-md cursor-pointer ${
                                    activeChatId === chat.id
                                        ? 'bg-green-100 text-green-700'
                                        : 'hover:bg-gray-200'
                                }`}
                                onClick={() => onSelectChat(chat.id)}
                            >
                                <span className="truncate">{chat.title}</span>
                                <button
                                    onClick={(e) =>
                                        handleDeleteChat(chat.id, e)
                                    }
                                    className="opacity-50 hover:opacity-100"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
