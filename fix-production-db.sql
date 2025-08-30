-- Add missing currency column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'usd';

-- Add missing points column to transactions table if it doesn't exist
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS points integer;

-- Add missing stripe_payment_intent_id column if it doesn't exist
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id varchar;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
ORDER BY ordinal_position;