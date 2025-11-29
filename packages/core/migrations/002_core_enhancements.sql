-- Core Enhancements Migration
-- Consolidated from migrations 003-009
-- Description: Advanced content management, user management, workflow automation, plugin system, and logging

-- ============================================================================
-- CONTENT MANAGEMENT ENHANCEMENTS (from 003_stage5_enhancements.sql)
-- ============================================================================

-- Add content scheduling columns
ALTER TABLE content ADD COLUMN scheduled_publish_at INTEGER;
ALTER TABLE content ADD COLUMN scheduled_unpublish_at INTEGER;

-- Add workflow and review columns
ALTER TABLE content ADD COLUMN review_status TEXT DEFAULT 'none'; -- none, pending, approved, rejected
ALTER TABLE content ADD COLUMN reviewer_id TEXT REFERENCES users(id);
ALTER TABLE content ADD COLUMN reviewed_at INTEGER;
ALTER TABLE content ADD COLUMN review_notes TEXT;

-- Add content metadata
ALTER TABLE content ADD COLUMN meta_title TEXT;
ALTER TABLE content ADD COLUMN meta_description TEXT;
ALTER TABLE content ADD COLUMN featured_image_id TEXT REFERENCES media(id);
ALTER TABLE content ADD COLUMN content_type TEXT DEFAULT 'standard'; -- standard, template, component

-- Create content_fields table for dynamic field definitions
CREATE TABLE IF NOT EXISTS content_fields (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL, -- text, richtext, number, boolean, date, select, media, relationship
  field_label TEXT NOT NULL,
  field_options TEXT, -- JSON for select options, validation rules, etc.
  field_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  is_searchable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(collection_id, field_name)
);

-- Create content_relationships table for content relationships
CREATE TABLE IF NOT EXISTS content_relationships (
  id TEXT PRIMARY KEY,
  source_content_id TEXT NOT NULL REFERENCES content(id),
  target_content_id TEXT NOT NULL REFERENCES content(id),
  relationship_type TEXT NOT NULL, -- references, tags, categories
  created_at INTEGER NOT NULL,
  UNIQUE(source_content_id, target_content_id, relationship_type)
);

-- Create workflow_templates table for reusable workflows
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  collection_id TEXT REFERENCES collections(id), -- null means applies to all collections
  workflow_steps TEXT NOT NULL, -- JSON array of workflow steps
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Add indexes for content enhancements
CREATE INDEX IF NOT EXISTS idx_content_scheduled_publish ON content(scheduled_publish_at);
CREATE INDEX IF NOT EXISTS idx_content_scheduled_unpublish ON content(scheduled_unpublish_at);
CREATE INDEX IF NOT EXISTS idx_content_review_status ON content(review_status);
CREATE INDEX IF NOT EXISTS idx_content_reviewer ON content(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_content_content_type ON content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_fields_collection ON content_fields(collection_id);
CREATE INDEX IF NOT EXISTS idx_content_fields_name ON content_fields(field_name);
CREATE INDEX IF NOT EXISTS idx_content_fields_type ON content_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_content_fields_order ON content_fields(field_order);
CREATE INDEX IF NOT EXISTS idx_content_relationships_source ON content_relationships(source_content_id);
CREATE INDEX IF NOT EXISTS idx_content_relationships_target ON content_relationships(target_content_id);
CREATE INDEX IF NOT EXISTS idx_content_relationships_type ON content_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_collection ON workflow_templates(collection_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON workflow_templates(is_active);

-- ============================================================================
-- USER MANAGEMENT ENHANCEMENTS (from 004_stage6_user_management.sql)
-- ============================================================================

-- Add user profile and preferences columns
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark';
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN password_reset_token TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires INTEGER;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verification_token TEXT;
ALTER TABLE users ADD COLUMN invitation_token TEXT;
ALTER TABLE users ADD COLUMN invited_by TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN invited_at INTEGER;
ALTER TABLE users ADD COLUMN accepted_invitation_at INTEGER;

-- Create teams table for team-based collaboration
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  settings TEXT, -- JSON for team settings
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create team memberships table
CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- owner, admin, editor, member, viewer
  permissions TEXT, -- JSON for specific permissions
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(team_id, user_id)
);

-- Create permissions table for granular access control
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL, -- content, users, collections, media, settings
  created_at INTEGER NOT NULL
);

-- Create role permissions mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  created_at INTEGER NOT NULL,
  UNIQUE(role, permission_id)
);

-- Create user sessions table for better session management
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- Create activity log table for audit trails
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT, -- users, content, collections, media, etc.
  resource_id TEXT,
  details TEXT, -- JSON with additional details
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

-- Create password history table for security
CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Insert default permissions
INSERT OR IGNORE INTO permissions (id, name, description, category, created_at) VALUES
  ('perm_content_create', 'content.create', 'Create new content', 'content', strftime('%s', 'now') * 1000),
  ('perm_content_read', 'content.read', 'View content', 'content', strftime('%s', 'now') * 1000),
  ('perm_content_update', 'content.update', 'Edit existing content', 'content', strftime('%s', 'now') * 1000),
  ('perm_content_delete', 'content.delete', 'Delete content', 'content', strftime('%s', 'now') * 1000),
  ('perm_content_publish', 'content.publish', 'Publish/unpublish content', 'content', strftime('%s', 'now') * 1000),
  ('perm_collections_create', 'collections.create', 'Create new collections', 'collections', strftime('%s', 'now') * 1000),
  ('perm_collections_read', 'collections.read', 'View collections', 'collections', strftime('%s', 'now') * 1000),
  ('perm_collections_update', 'collections.update', 'Edit collections', 'collections', strftime('%s', 'now') * 1000),
  ('perm_collections_delete', 'collections.delete', 'Delete collections', 'collections', strftime('%s', 'now') * 1000),
  ('perm_collections_fields', 'collections.fields', 'Manage collection fields', 'collections', strftime('%s', 'now') * 1000),
  ('perm_media_upload', 'media.upload', 'Upload media files', 'media', strftime('%s', 'now') * 1000),
  ('perm_media_read', 'media.read', 'View media files', 'media', strftime('%s', 'now') * 1000),
  ('perm_media_update', 'media.update', 'Edit media metadata', 'media', strftime('%s', 'now') * 1000),
  ('perm_media_delete', 'media.delete', 'Delete media files', 'media', strftime('%s', 'now') * 1000),
  ('perm_users_create', 'users.create', 'Invite new users', 'users', strftime('%s', 'now') * 1000),
  ('perm_users_read', 'users.read', 'View user profiles', 'users', strftime('%s', 'now') * 1000),
  ('perm_users_update', 'users.update', 'Edit user profiles', 'users', strftime('%s', 'now') * 1000),
  ('perm_users_delete', 'users.delete', 'Deactivate users', 'users', strftime('%s', 'now') * 1000),
  ('perm_users_roles', 'users.roles', 'Manage user roles', 'users', strftime('%s', 'now') * 1000),
  ('perm_settings_read', 'settings.read', 'View system settings', 'settings', strftime('%s', 'now') * 1000),
  ('perm_settings_update', 'settings.update', 'Modify system settings', 'settings', strftime('%s', 'now') * 1000),
  ('perm_activity_read', 'activity.read', 'View activity logs', 'settings', strftime('%s', 'now') * 1000);

-- Assign permissions to default roles
INSERT OR IGNORE INTO role_permissions (id, role, permission_id, created_at) VALUES
  -- Admin has all permissions
  ('rp_admin_content_create', 'admin', 'perm_content_create', strftime('%s', 'now') * 1000),
  ('rp_admin_content_read', 'admin', 'perm_content_read', strftime('%s', 'now') * 1000),
  ('rp_admin_content_update', 'admin', 'perm_content_update', strftime('%s', 'now') * 1000),
  ('rp_admin_content_delete', 'admin', 'perm_content_delete', strftime('%s', 'now') * 1000),
  ('rp_admin_content_publish', 'admin', 'perm_content_publish', strftime('%s', 'now') * 1000),
  ('rp_admin_collections_create', 'admin', 'perm_collections_create', strftime('%s', 'now') * 1000),
  ('rp_admin_collections_read', 'admin', 'perm_collections_read', strftime('%s', 'now') * 1000),
  ('rp_admin_collections_update', 'admin', 'perm_collections_update', strftime('%s', 'now') * 1000),
  ('rp_admin_collections_delete', 'admin', 'perm_collections_delete', strftime('%s', 'now') * 1000),
  ('rp_admin_collections_fields', 'admin', 'perm_collections_fields', strftime('%s', 'now') * 1000),
  ('rp_admin_media_upload', 'admin', 'perm_media_upload', strftime('%s', 'now') * 1000),
  ('rp_admin_media_read', 'admin', 'perm_media_read', strftime('%s', 'now') * 1000),
  ('rp_admin_media_update', 'admin', 'perm_media_update', strftime('%s', 'now') * 1000),
  ('rp_admin_media_delete', 'admin', 'perm_media_delete', strftime('%s', 'now') * 1000),
  ('rp_admin_users_create', 'admin', 'perm_users_create', strftime('%s', 'now') * 1000),
  ('rp_admin_users_read', 'admin', 'perm_users_read', strftime('%s', 'now') * 1000),
  ('rp_admin_users_update', 'admin', 'perm_users_update', strftime('%s', 'now') * 1000),
  ('rp_admin_users_delete', 'admin', 'perm_users_delete', strftime('%s', 'now') * 1000),
  ('rp_admin_users_roles', 'admin', 'perm_users_roles', strftime('%s', 'now') * 1000),
  ('rp_admin_settings_read', 'admin', 'perm_settings_read', strftime('%s', 'now') * 1000),
  ('rp_admin_settings_update', 'admin', 'perm_settings_update', strftime('%s', 'now') * 1000),
  ('rp_admin_activity_read', 'admin', 'perm_activity_read', strftime('%s', 'now') * 1000),
  -- Editor permissions
  ('rp_editor_content_create', 'editor', 'perm_content_create', strftime('%s', 'now') * 1000),
  ('rp_editor_content_read', 'editor', 'perm_content_read', strftime('%s', 'now') * 1000),
  ('rp_editor_content_update', 'editor', 'perm_content_update', strftime('%s', 'now') * 1000),
  ('rp_editor_content_publish', 'editor', 'perm_content_publish', strftime('%s', 'now') * 1000),
  ('rp_editor_collections_read', 'editor', 'perm_collections_read', strftime('%s', 'now') * 1000),
  ('rp_editor_media_upload', 'editor', 'perm_media_upload', strftime('%s', 'now') * 1000),
  ('rp_editor_media_read', 'editor', 'perm_media_read', strftime('%s', 'now') * 1000),
  ('rp_editor_media_update', 'editor', 'perm_media_update', strftime('%s', 'now') * 1000),
  ('rp_editor_users_read', 'editor', 'perm_users_read', strftime('%s', 'now') * 1000),
  -- Viewer permissions
  ('rp_viewer_content_read', 'viewer', 'perm_content_read', strftime('%s', 'now') * 1000),
  ('rp_viewer_collections_read', 'viewer', 'perm_collections_read', strftime('%s', 'now') * 1000),
  ('rp_viewer_media_read', 'viewer', 'perm_media_read', strftime('%s', 'now') * 1000),
  ('rp_viewer_users_read', 'viewer', 'perm_users_read', strftime('%s', 'now') * 1000);

-- Create indexes for user management
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user_id ON team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);

-- ============================================================================
-- WORKFLOW & AUTOMATION (from 005_stage7_workflow_automation.sql)
-- ============================================================================

-- Workflow States Table
CREATE TABLE IF NOT EXISTS workflow_states (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  is_initial INTEGER DEFAULT 0,
  is_final INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default workflow states
INSERT OR IGNORE INTO workflow_states (id, name, description, color, is_initial, is_final) VALUES
('draft', 'Draft', 'Content is being worked on', '#F59E0B', 1, 0),
('pending-review', 'Pending Review', 'Content is waiting for review', '#3B82F6', 0, 0),
('approved', 'Approved', 'Content has been approved', '#10B981', 0, 0),
('published', 'Published', 'Content is live', '#059669', 0, 1),
('rejected', 'Rejected', 'Content was rejected', '#EF4444', 0, 1),
('archived', 'Archived', 'Content has been archived', '#6B7280', 0, 1);

-- Workflows Table
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  collection_id TEXT,
  is_active INTEGER DEFAULT 1,
  auto_publish INTEGER DEFAULT 0,
  require_approval INTEGER DEFAULT 1,
  approval_levels INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Workflow Transitions Table
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workflow_id TEXT NOT NULL,
  from_state_id TEXT NOT NULL,
  to_state_id TEXT NOT NULL,
  required_permission TEXT,
  auto_transition INTEGER DEFAULT 0,
  transition_conditions TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (from_state_id) REFERENCES workflow_states(id),
  FOREIGN KEY (to_state_id) REFERENCES workflow_states(id)
);

-- Content Workflow Status Table
CREATE TABLE IF NOT EXISTS content_workflow_status (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  current_state_id TEXT NOT NULL,
  assigned_to TEXT,
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  FOREIGN KEY (current_state_id) REFERENCES workflow_states(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  UNIQUE(content_id, workflow_id)
);

-- Scheduled Content Table
CREATE TABLE IF NOT EXISTS scheduled_content (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'publish', 'unpublish', 'archive'
  scheduled_at DATETIME NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
  executed_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'workflow', 'schedule', 'system'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT, -- JSON
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notification Preferences Table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  email_enabled INTEGER DEFAULT 1,
  in_app_enabled INTEGER DEFAULT 1,
  digest_frequency TEXT DEFAULT 'daily', -- 'immediate', 'hourly', 'daily', 'weekly'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, notification_type)
);

-- Webhooks Table
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL, -- JSON array of event types
  is_active INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  last_success_at DATETIME,
  last_failure_at DATETIME,
  failure_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Deliveries Table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  response_status INTEGER,
  response_body TEXT,
  attempt_count INTEGER DEFAULT 1,
  delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

-- Automation Rules Table
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'content_created', 'content_updated', 'workflow_transition', 'schedule'
  trigger_conditions TEXT, -- JSON
  action_type TEXT NOT NULL, -- 'workflow_transition', 'send_notification', 'webhook_call', 'auto_save'
  action_config TEXT, -- JSON
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auto-save Drafts Table
CREATE TABLE IF NOT EXISTS auto_save_drafts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_id TEXT,
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  fields TEXT, -- JSON
  last_saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(content_id, user_id)
);

-- Add workflow-related columns to existing content table
ALTER TABLE content ADD COLUMN workflow_state_id TEXT DEFAULT 'draft';
ALTER TABLE content ADD COLUMN embargo_until DATETIME;
ALTER TABLE content ADD COLUMN expires_at DATETIME;
ALTER TABLE content ADD COLUMN version_number INTEGER DEFAULT 1;
ALTER TABLE content ADD COLUMN is_auto_saved INTEGER DEFAULT 0;

-- Create indexes for workflow performance
CREATE INDEX IF NOT EXISTS idx_content_workflow_status_content_id ON content_workflow_status(content_id);
CREATE INDEX IF NOT EXISTS idx_content_workflow_status_workflow_id ON content_workflow_status(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_content_id ON workflow_history(content_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_content_scheduled_at ON scheduled_content(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_content_status ON scheduled_content(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_auto_save_drafts_user_id ON auto_save_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_content_workflow_state ON content(workflow_state_id);

-- ============================================================================
-- PLUGIN SYSTEM (from 006_plugin_system.sql)
-- ============================================================================

-- Plugins table
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT,
    status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    is_core BOOLEAN DEFAULT FALSE,
    settings JSON,
    permissions JSON,
    dependencies JSON,
    download_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    installed_at INTEGER NOT NULL,
    activated_at INTEGER,
    last_updated INTEGER NOT NULL,
    error_message TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- Plugin hooks table (registered hooks by plugins)
CREATE TABLE IF NOT EXISTS plugin_hooks (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    hook_name TEXT NOT NULL,
    handler_name TEXT NOT NULL,
    priority INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
    UNIQUE(plugin_id, hook_name, handler_name)
);

-- Plugin routes table
CREATE TABLE IF NOT EXISTS plugin_routes (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    handler_name TEXT NOT NULL,
    middleware JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
    UNIQUE(plugin_id, path, method)
);

-- Plugin assets table (CSS, JS files provided by plugins)
CREATE TABLE IF NOT EXISTS plugin_assets (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('css', 'js', 'image', 'font')),
    asset_path TEXT NOT NULL,
    load_order INTEGER DEFAULT 100,
    load_location TEXT DEFAULT 'footer' CHECK (load_location IN ('header', 'footer')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);

-- Plugin activity log
CREATE TABLE IF NOT EXISTS plugin_activity_log (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT,
    details JSON,
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);

-- Create indexes for plugin system
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);
CREATE INDEX IF NOT EXISTS idx_plugin_hooks_plugin ON plugin_hooks(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_routes_plugin ON plugin_routes(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_assets_plugin ON plugin_assets(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_activity_plugin ON plugin_activity_log(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_activity_timestamp ON plugin_activity_log(timestamp);

-- Note: Core plugins are now managed by the PluginBootstrapService in packages/core/src/services/plugin-bootstrap.ts
-- This includes: core-auth, core-media, core-cache, workflow-plugin, database-tools, seed-data, easy-mdx
-- No need to insert them here as they will be auto-installed on first boot

-- Add plugin management permission
INSERT OR IGNORE INTO permissions (id, name, description, category, created_at)
VALUES (
    'manage:plugins',
    'Manage Plugins',
    'Install, uninstall, activate, and configure plugins',
    'system',
    unixepoch()
);

-- Grant plugin management permission to admin role
INSERT OR IGNORE INTO role_permissions (id, role, permission_id, created_at)
VALUES ('role-perm-manage-plugins', 'admin', 'manage:plugins', unixepoch());

-- ============================================================================
-- SYSTEM LOGGING (from 009_system_logging.sql)
-- ============================================================================

-- System logs table for tracking application events
CREATE TABLE IF NOT EXISTS system_logs (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    category TEXT NOT NULL CHECK (category IN ('auth', 'api', 'workflow', 'plugin', 'media', 'system', 'security', 'error')),
    message TEXT NOT NULL,
    data TEXT,  -- JSON data
    user_id TEXT,
    session_id TEXT,
    request_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    method TEXT,
    url TEXT,
    status_code INTEGER,
    duration INTEGER,  -- milliseconds
    stack_trace TEXT,
    tags TEXT,  -- JSON array
    source TEXT,  -- source of the log entry
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Log configuration table for managing log settings per category
CREATE TABLE IF NOT EXISTS log_config (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL UNIQUE CHECK (category IN ('auth', 'api', 'workflow', 'plugin', 'media', 'system', 'security', 'error')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    retention_days INTEGER NOT NULL DEFAULT 30,
    max_size_mb INTEGER NOT NULL DEFAULT 100,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create indexes for system logging
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_status_code ON system_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);

-- Insert default log configurations
INSERT OR IGNORE INTO log_config (id, category, enabled, level, retention_days, max_size_mb) VALUES
('log-config-auth', 'auth', TRUE, 'info', 90, 50),
('log-config-api', 'api', TRUE, 'info', 30, 100),
('log-config-workflow', 'workflow', TRUE, 'info', 60, 50),
('log-config-plugin', 'plugin', TRUE, 'warn', 30, 25),
('log-config-media', 'media', TRUE, 'info', 30, 50),
('log-config-system', 'system', TRUE, 'info', 90, 100),
('log-config-security', 'security', TRUE, 'warn', 180, 100),
('log-config-error', 'error', TRUE, 'error', 90, 200);