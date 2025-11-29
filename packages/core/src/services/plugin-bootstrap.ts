import type { D1Database } from "@cloudflare/workers-types";
import { PluginService, type PluginData } from "./plugin-service";
import { Context, Effect, Layer } from "effect";
import { DatabaseError, DatabaseService } from "./database-effect";

export interface CorePlugin {
  id: string;
  name: string;
  display_name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  permissions: string[];
  dependencies: string[];
  settings?: any;
}

/**
 * Plugin Bootstrap Service Interface
 */
export interface PluginBootstrapService {
  readonly bootstrapCorePlugins: () => Effect.Effect<void, DatabaseError, PluginService | DatabaseService>;
  readonly isBootstrapNeeded: () => Effect.Effect<boolean, DatabaseError, PluginService>;
}

/**
 * Plugin Bootstrap Service Tag for dependency injection
 */
export const PluginBootstrapService = Context.GenericTag<PluginBootstrapService>('@services/PluginBootstrapService');

/**
 * Core plugins that should always be available in the system
 */
const CORE_PLUGINS: CorePlugin[] = [
  {
    id: "core-auth",
    name: "core-auth",
    display_name: "Authentication System",
    description: "Core authentication and user management system",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "security",
    icon: "🔐",
    permissions: ["manage:users", "manage:roles", "manage:permissions"],
    dependencies: [],
    settings: {
      requiredFields: {
        email: { required: true, minLength: 5, label: "Email", type: "email" },
        password: { required: true, minLength: 8, label: "Password", type: "password" },
        username: { required: true, minLength: 3, label: "Username", type: "text" },
        firstName: { required: true, minLength: 1, label: "First Name", type: "text" },
        lastName: { required: true, minLength: 1, label: "Last Name", type: "text" },
      },
      validation: {
        emailFormat: true,
        allowDuplicateUsernames: false,
        passwordRequirements: {
          requireUppercase: false,
          requireLowercase: false,
          requireNumbers: false,
          requireSpecialChars: false,
        },
      },
      registration: {
        enabled: true,
        requireEmailVerification: false,
        defaultRole: "viewer",
      },
    },
  },
  {
    id: "core-media",
    name: "core-media",
    display_name: "Media Manager",
    description: "Core media upload and management system",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "media",
    icon: "📸",
    permissions: ["manage:media", "upload:files"],
    dependencies: [],
    settings: {},
  },
  {
    id: "database-tools",
    name: "database-tools",
    display_name: "Database Tools",
    description:
      "Database management tools including truncate, backup, and validation",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "system",
    icon: "🗄️",
    permissions: ["manage:database", "admin"],
    dependencies: [],
    settings: {
      enableTruncate: true,
      enableBackup: true,
      enableValidation: true,
      requireConfirmation: true,
    },
  },
  {
    id: "seed-data",
    name: "seed-data",
    display_name: "Seed Data",
    description:
      "Generate realistic example users and content for testing and development",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "development",
    icon: "🌱",
    permissions: ["admin"],
    dependencies: [],
    settings: {
      userCount: 20,
      contentCount: 200,
      defaultPassword: "password123",
    },
  },
  {
    id: "core-cache",
    name: "core-cache",
    display_name: "Cache System",
    description:
      "Three-tiered caching system with memory, KV, and database layers",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "performance",
    icon: "⚡",
    permissions: ["manage:cache", "view:stats"],
    dependencies: [],
    settings: {
      enableMemoryCache: true,
      enableKVCache: true,
      enableDatabaseCache: true,
      defaultTTL: 3600,
    },
  },
  {
    id: "workflow-plugin",
    name: "workflow-plugin",
    display_name: "Workflow Management",
    description:
      "Content workflow management with approval chains, scheduling, and automation",
    version: "1.0.0-beta.1",
    author: "The Patro Authors",
    category: "content",
    icon: "🔄",
    permissions: ["manage:workflows", "view:workflows", "transition:content"],
    dependencies: ["content-plugin"],
    settings: {
      enableApprovalChains: true,
      enableScheduling: true,
      enableAutomation: true,
      enableNotifications: true,
    },
  },
  {
    id: "ai-translator",
    name: "ai-translator",
    display_name: "AI Translator",
    description: "AI-driven automatic content translation using Cloudflare Workers AI",
    version: "1.0.0-beta.1",
    author: "The Patro Authors",
    category: "content",
    icon: "🌐",
    permissions: ["ai-translator:manage"],
    dependencies: [],
    settings: {
      enabled: true,
      defaultSourceLanguage: "en",
      targetLanguages: ["cs", "de", "fr", "es", "it", "pl"],
      autoTranslate: true,
      translateOnCreate: true,
      translateOnUpdate: false,
      aiModel: "@cf/meta/m2m100-1.2b",
    },
  },
];

/**
 * Ensure a specific plugin is installed
 */
const ensurePluginInstalled = (plugin: CorePlugin): Effect.Effect<void, never, PluginService | DatabaseService> =>
  Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    const dbService = yield* DatabaseService;

    // Check if plugin already exists
    const existingPlugin: PluginData | null = yield* 
      pluginService.getPlugin(plugin.id).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    ;

    if (existingPlugin) {
      console.log(
        `[PluginBootstrap] Plugin already installed: ${plugin.display_name} (status: ${existingPlugin.status})`
      );

      // Update plugin if version changed
      if (existingPlugin.version !== plugin.version) {
        console.log(
          `[PluginBootstrap] Updating plugin version: ${plugin.display_name} from ${existingPlugin.version} to ${plugin.version}`
        );
        
        const now = Math.floor(Date.now() / 1000);
        yield* 
          dbService.execute(
            `
            UPDATE plugins 
            SET 
              version = ?,
              description = ?,
              permissions = ?,
              settings = ?,
              last_updated = ?
            WHERE id = ?
          `,
            [
              plugin.version,
              plugin.description,
              JSON.stringify(plugin.permissions),
              JSON.stringify(plugin.settings || {}),
              now,
              plugin.id,
            ]
          ).pipe(
            Effect.tapError((e) => Effect.logError("Selhání service zápisu", e)),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
        ;
      }

      // ALWAYS ensure core-auth is active (critical for system functionality)
      if (plugin.id === 'core-auth' && existingPlugin.status !== 'active') {
        console.log(
          `[PluginBootstrap] Core-auth plugin is inactive, activating it now...`
        );
        yield* 
          pluginService.activatePlugin(plugin.id).pipe(
            Effect.tapError((e) => Effect.logError("Selhání service zápisu", e)),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
        ;
      }
    } else {
      // Install the plugin
      console.log(
        `[PluginBootstrap] Installing plugin: ${plugin.display_name}`
      );
      yield* 
        pluginService.installPlugin({
          ...plugin,
          // All plugins in CORE_PLUGINS are treated as core plugins
          is_core: true,
        }).pipe(
          Effect.tapError((e) => Effect.logError("Selhání service zápisu", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      ;

      // Activate core plugins immediately after installation
      // All plugins in CORE_PLUGINS are core plugins and should be activated
      console.log(
        `[PluginBootstrap] Activating newly installed core plugin: ${plugin.display_name}`
      );
      yield* 
        pluginService.activatePlugin(plugin.id).pipe(
          Effect.tapError((e) => Effect.logError("Selhání service zápisu", e)),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      ;
    }
  }).pipe(
    Effect.catchAll((error) => {
      console.error(
        `[PluginBootstrap] Error ensuring plugin ${plugin.display_name}:`,
        error
      );
      // Don't throw - continue with other plugins
      return Effect.succeed(undefined);
    })
  );

/**
 * Create a Plugin Bootstrap Service implementation
 */
export const makePluginBootstrapService = (): PluginBootstrapService => ({
  bootstrapCorePlugins: () =>
    Effect.gen(function* (_) {
      console.log("[PluginBootstrap] Starting core plugin bootstrap process...");

      // Check each core plugin
      for (const corePlugin of CORE_PLUGINS) {
        yield* ensurePluginInstalled(corePlugin);
      }

      console.log(
        "[PluginBootstrap] Core plugin bootstrap completed successfully"
      );
    }).pipe(
      Effect.catchAll((error) => {
        console.error("[PluginBootstrap] Error during plugin bootstrap:", error);
        return Effect.fail(error);
      })
    ),

  isBootstrapNeeded: () =>
    Effect.gen(function* (_) {
      const pluginService = yield* PluginService;

      // Check if any core plugins from CORE_PLUGINS are missing in the database
      for (const corePlugin of CORE_PLUGINS) {
        const exists = yield* 
          pluginService.getPlugin(corePlugin.id).pipe(
            Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
            Effect.catchAll(() => Effect.succeed(null))
          )
        ;
        if (!exists) {
          return true;
        }
      }
      return false;
    }).pipe(
      Effect.catchAll((error) => {
        // If there's an error (like table doesn't exist), we need bootstrap
        console.error(
          "[PluginBootstrap] Error checking bootstrap status:",
          error
        );
        return Effect.succeed(true);
      })
    ),
});

/**
 * Create a Layer for providing PluginBootstrapService
 */
export const makePluginBootstrapServiceLayer = (): Layer.Layer<PluginBootstrapService, never, PluginService | DatabaseService> =>
  Layer.succeed(PluginBootstrapService, makePluginBootstrapService());
