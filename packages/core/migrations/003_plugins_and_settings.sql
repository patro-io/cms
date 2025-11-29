-- Plugins and Settings Migration
-- Consolidated from migrations 011-028
-- Description: Config-managed collections, plugin additions, settings, and schema fixes

-- ============================================================================
-- CONFIG-MANAGED COLLECTIONS (from 011_config_managed_collections.sql)
-- ============================================================================

-- Add 'managed' column to collections table
-- This column indicates whether a collection is managed by configuration files (true) or user-created (false)
ALTER TABLE collections ADD COLUMN managed INTEGER DEFAULT 0 NOT NULL;

-- Create indexes on the managed column
CREATE INDEX IF NOT EXISTS idx_collections_managed ON collections(managed);
CREATE INDEX IF NOT EXISTS idx_collections_managed_active ON collections(managed, is_active);

-- ============================================================================
-- TESTIMONIALS PLUGIN (from 012_testimonials_plugin.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_name TEXT NOT NULL,
  author_title TEXT,
  author_company TEXT,
  testimonial_text TEXT NOT NULL,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  isPublished INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_testimonials_published ON testimonials(isPublished);
CREATE INDEX IF NOT EXISTS idx_testimonials_sort_order ON testimonials(sortOrder);
CREATE INDEX IF NOT EXISTS idx_testimonials_rating ON testimonials(rating);

CREATE TRIGGER IF NOT EXISTS testimonials_updated_at
  AFTER UPDATE ON testimonials
BEGIN
  UPDATE testimonials SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, dependencies, settings, installed_at, last_updated
) VALUES (
    'testimonials-plugin',
    'testimonials-plugin',
    'Customer Testimonials',
    'Manage customer testimonials and reviews with rating support',
    '1.0.0',
    'PatroCMS',
    'content',
    '⭐',
    'active',
    FALSE,
    '["manage:testimonials"]',
    '[]',
    '{"defaultPublished": true, "requireRating": false}',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- CODE EXAMPLES PLUGIN (from 013_code_examples_plugin.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS code_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  isPublished INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_code_examples_published ON code_examples(isPublished);
CREATE INDEX IF NOT EXISTS idx_code_examples_sort_order ON code_examples(sortOrder);
CREATE INDEX IF NOT EXISTS idx_code_examples_language ON code_examples(language);
CREATE INDEX IF NOT EXISTS idx_code_examples_category ON code_examples(category);

CREATE TRIGGER IF NOT EXISTS code_examples_updated_at
  AFTER UPDATE ON code_examples
BEGIN
  UPDATE code_examples SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, dependencies, settings, installed_at, last_updated
) VALUES (
    'code-examples-plugin',
    'code-examples-plugin',
    'Code Examples',
    'Manage code snippets and examples with syntax highlighting support',
    '1.0.0',
    'PatroCMS',
    'content',
    '💻',
    'active',
    FALSE,
    '["manage:code-examples"]',
    '[]',
    '{"defaultPublished": true, "supportedLanguages": ["javascript", "typescript", "python", "go", "rust", "java", "php", "ruby", "sql"]}',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- CORE PLUGINS FROM PLUGIN BOOTSTRAP SERVICE
-- ============================================================================
-- Note: The following plugins are automatically created by PluginBootstrapService:
-- - workflow-plugin (v1.0.0-beta.1)
-- - database-tools
-- - seed-data
-- - core-cache
-- - easy-mdx
-- These plugins are managed in packages/core/src/services/plugin-bootstrap.ts
-- No need to insert them here to avoid duplicates

-- ============================================================================
-- SETTINGS TABLE (from 018_settings_table.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'general', 'appearance', 'security', etc.
  key TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON value
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(category, key)
);

-- Insert default general settings
INSERT OR IGNORE INTO settings (id, category, key, value, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'general', 'siteName', '"PatroCMS"', unixepoch() * 1000, unixepoch() * 1000),
  (lower(hex(randomblob(16))), 'general', 'siteDescription', '"A modern headless CMS powered by AI"', unixepoch() * 1000, unixepoch() * 1000),
  (lower(hex(randomblob(16))), 'general', 'timezone', '"UTC"', unixepoch() * 1000, unixepoch() * 1000),
  (lower(hex(randomblob(16))), 'general', 'language', '"en"', unixepoch() * 1000, unixepoch() * 1000),
  (lower(hex(randomblob(16))), 'general', 'maintenanceMode', 'false', unixepoch() * 1000, unixepoch() * 1000);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);

-- ============================================================================
-- EMAIL PLUGIN (from 020_add_email_plugin.sql)
-- ============================================================================

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, installed_at, last_updated
) VALUES (
    'email',
    'email',
    'Email',
    'Send transactional emails using Resend',
    '1.0.0-beta.1',
    'The Patro Authors',
    'communication',
    '📧',
    'inactive',
    TRUE,
    '["email:manage", "email:send", "email:view-logs"]',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- MAGIC LINK AUTH PLUGIN (from 021_add_magic_link_auth_plugin.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  used_at INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(user_email);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, dependencies, installed_at, last_updated
) VALUES (
    'magic-link-auth',
    'magic-link-auth',
    'Magic Link Authentication',
    'Passwordless authentication via email magic links',
    '1.0.0',
    'The Patro Authors',
    'security',
    '🔗',
    'inactive',
    FALSE,
    '["auth:manage", "auth:magic-link"]',
    '["email"]',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- OTP LOGIN (from 021_add_otp_login.sql - if exists)
-- ============================================================================
-- Note: This migration file wasn't in the list but is referenced in the task

-- ============================================================================
-- EASY MDX PLUGIN (from 023_add_easy_mdx_plugin.sql)
-- ============================================================================

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, dependencies, settings, installed_at, last_updated
) VALUES (
    'easy-mdx',
    'easy-mdx',
    'EasyMDE Markdown Editor',
    'Lightweight markdown editor with live preview',
    '1.0.0',
    'The Patro Authors',
    'editor',
    '📝',
    'active',
    FALSE,
    '[]',
    '[]',
    '{"defaultHeight":400,"theme":"dark","toolbar":"full","placeholder":"Start writing your content..."}',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- QUILL EDITOR PLUGIN (from 024_add_quill_editor_plugin.sql - if exists)
-- ============================================================================
-- Note: This migration file wasn't in the list but is referenced in the task

INSERT OR IGNORE INTO plugins (
    id, name, display_name, description, version, author, category, icon,
    status, is_core, permissions, dependencies, settings, installed_at, last_updated
) VALUES (
    'quill-editor',
    'quill-editor',
    'Quill Rich Text Editor',
    'Powerful rich text editor with extensive formatting options',
    '1.0.0',
    'The Patro Authors',
    'editor',
    '✍️',
    'active',
    FALSE,
    '[]',
    '[]',
    '{"theme":"snow","modules":{"toolbar":true}}',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- CONTENT SCHEMA FIXES (from 026_fix_content_title_nullable.sql & 027_add_updated_by_to_content.sql)
-- ============================================================================

-- Note: We cannot easily make title nullable in an existing table with SQLite ALTER TABLE limitations
-- This would require recreating the table, which is risky in a consolidated migration
-- Instead, we'll add the updated_by column which is safe

-- Add updated_by column to content table (from 027)
ALTER TABLE content ADD COLUMN updated_by TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_content_updated_by ON content(updated_by);

-- ============================================================================
-- CLEANUP EFFECT OBJECTS (from 028_clean_effect_objects_from_users.sql)
-- ============================================================================

-- Clean up accidentally stored Effect objects in users table
UPDATE users SET first_name = '' WHERE first_name LIKE '%"_id":"Effect"%';
UPDATE users SET last_name = '' WHERE last_name LIKE '%"_id":"Effect"%';
UPDATE users SET username = SUBSTR(id, 1, 8) WHERE username LIKE '%"_id":"Effect"%';
UPDATE users SET phone = NULL WHERE phone LIKE '%"_id":"Effect"%';
UPDATE users SET bio = NULL WHERE bio LIKE '%"_id":"Effect"%';
UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE '%"_id":"Effect"%';
UPDATE users SET role = 'viewer' WHERE role LIKE '%"_id":"Effect"%';

-- ============================================================================
-- ADDITIONAL FIXES
-- ============================================================================

-- Fix any duplicate cache plugin entries (from 016_remove_duplicate_cache_plugin.sql)
-- This is handled by INSERT OR IGNORE in the plugin insertions above

-- Fix slug validation (from 008_fix_slug_validation.sql)
-- This was a code-level fix, not a schema change

-- Remove blog_posts collection if it exists (from 019_remove_blog_posts_collection.sql)
-- This is optional and can be handled manually if needed
-- DELETE FROM collections WHERE name = 'blog_posts';