-- Migration: Split managed flag into code_managed and fields_editable
-- Description: Splits the managed flag into two separate flags for better control
-- Date: 2025-11-28

-- Add code_managed column to collections table
-- This indicates collections defined in code (vs. database-only)
ALTER TABLE collections ADD COLUMN code_managed INTEGER DEFAULT 0;

-- Add fields_editable column to collections table
-- This controls whether fields can be edited in UI
ALTER TABLE collections ADD COLUMN fields_editable INTEGER DEFAULT 1;

-- Migrate existing managed flag values
-- Collections with managed=1 should have code_managed=1 and fields_editable=1
UPDATE collections 
SET code_managed = managed, 
    fields_editable = 1 
WHERE managed IS NOT NULL AND managed = 1;

-- Create index for efficient querying of code-managed collections
CREATE INDEX IF NOT EXISTS idx_collections_code_managed ON collections(code_managed);