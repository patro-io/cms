-- Migration: Add language column to users table
-- Date: 2024-11-28
-- Description: Adds language preference column to users table for i18n support with IP geolocation

-- Add language column to users table (nullable, no default)
ALTER TABLE users ADD COLUMN language TEXT;

-- Note: Existing users will have NULL language, which will trigger IP geolocation
-- New users registered after this migration will also get NULL by default