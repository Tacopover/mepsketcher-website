-- Migration: Create email_verification_tokens table
-- Purpose: Store temporary tokens for email verification flow
-- Created: 2026-02-03

-- Create the email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT FALSE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_verification_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_verification_expires ON email_verification_tokens(expires_at);

-- Enable Row Level Security
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only the service role can manage these tokens
CREATE POLICY "Service role manages verification tokens"
    ON email_verification_tokens
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Create a function to clean up expired tokens (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM email_verification_tokens
    WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Comment for documentation
COMMENT ON TABLE email_verification_tokens IS 'Temporary storage for email verification tokens. Tokens expire after 24 hours and are deleted 7 days after expiration.';
