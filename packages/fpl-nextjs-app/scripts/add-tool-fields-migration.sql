-- Migration to add tool-related fields to messages table
-- Run this after the main migration

-- Add columns for tool calls and results
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS token_count INTEGER,
ADD COLUMN IF NOT EXISTS tool_calls JSONB,
ADD COLUMN IF NOT EXISTS tool_results JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_tool_calls ON messages USING GIN (tool_calls);
CREATE INDEX IF NOT EXISTS idx_messages_token_count ON messages (token_count);

-- Add a column to track conversation metrics
CREATE TABLE IF NOT EXISTS conversation_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for chat_id
CREATE INDEX IF NOT EXISTS idx_conversation_metrics_chat_id ON conversation_metrics(chat_id);

-- Update function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for conversation_metrics
CREATE TRIGGER update_conversation_metrics_updated_at 
BEFORE UPDATE ON conversation_metrics 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();