-- Migration: Add index on translation_group_id for translation linking
-- This improves query performance when fetching related translations

-- Add index on translation_group_id in content table
CREATE INDEX IF NOT EXISTS idx_content_translation_group_id 
ON content(translation_group_id);

-- Add composite index for common translation queries (collection + translation_group)
CREATE INDEX IF NOT EXISTS idx_content_collection_translation 
ON content(collection_id, translation_group_id);

-- Add index on language for filtering by language
CREATE INDEX IF NOT EXISTS idx_content_language 
ON content(language);