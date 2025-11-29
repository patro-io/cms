-- Migration: Add language support for i18n
-- Description: Adds language field to users table and default language setting
-- Date: 2024-11-21

-- Add language column to users table
-- Default is 'en' (English)
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';

-- Add default language to settings table
-- This is used as fallback when user has no language preference
INSERT OR IGNORE INTO settings (id, key, value, description, type, created_at, updated_at)
VALUES (
  'setting_language',
  'language',
  'en',
  'Default language for the application (en, cs)',
  'text',
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
);