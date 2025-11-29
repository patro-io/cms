-- Migration: Add translation support for AI-driven localization
-- Description: Adds translation_group_id and translation_source columns for content grouping
-- Date: 2024-11-27

-- Add translation_group_id column to content table
-- This UUID links all language variants of the same content together
ALTER TABLE content ADD COLUMN translation_group_id TEXT;

-- Add translation_source column to content table
-- Values: 'manual' (human-created), 'ai' (AI-generated translation)
ALTER TABLE content ADD COLUMN translation_source TEXT DEFAULT 'manual';

-- Add language column to content table if not exists
-- This stores the language code (e.g., 'cs', 'en', 'de')
ALTER TABLE content ADD COLUMN language TEXT DEFAULT 'cs';

-- Create index for efficient translation group queries
CREATE INDEX IF NOT EXISTS idx_content_translation_group ON content(translation_group_id);

-- Create index for language filtering
CREATE INDEX IF NOT EXISTS idx_content_language ON content(language);

-- Create composite index for finding translations of specific content
CREATE INDEX IF NOT EXISTS idx_content_translation_lookup ON content(translation_group_id, language);