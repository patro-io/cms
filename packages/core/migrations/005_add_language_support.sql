-- Migration: Add language support for i18n
-- Description: Ensures language field exists and adds default language setting
-- Date: 2024-11-21

-- Note: language column already exists in users table (added in 002_core_enhancements.sql)
-- We just need to ensure default values are set

-- Update existing users to have default language if NULL
UPDATE users SET language = 'en' WHERE language IS NULL OR language = '';

-- Language setting already exists in settings table from 003_plugins_and_settings.sql
-- Just ensure it's set correctly (using correct settings table structure)
DELETE FROM settings WHERE category = 'general' AND key = 'language';
INSERT INTO settings (id, category, key, value, created_at, updated_at)
VALUES (
  lower(hex(randomblob(16))),
  'general',
  'language',
  '"en"',
  unixepoch() * 1000,
  unixepoch() * 1000
);