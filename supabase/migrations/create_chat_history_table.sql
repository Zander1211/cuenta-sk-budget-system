CREATE TABLE chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Set up Row Level Security
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only select their own chat history
CREATE POLICY "Users can view their own chat history"
ON chat_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can only insert their own chat history
CREATE POLICY "Users can insert their own chat history"
ON chat_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own chat history (optional but good practice)
CREATE POLICY "Users can update their own chat history"
ON chat_history
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own chat history (optional but good practice)
CREATE POLICY "Users can delete their own chat history"
ON chat_history
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
