import { Effect } from "effect";
import { Hono } from "hono";
import { getTranslate } from "../middleware";
import { PluginService, makePluginServiceLayer } from "../services/plugin-service";
import { SettingsService, makeAppLayer } from "../services";
import {
  PluginSettingsPageData,
  renderPluginSettingsPage,
} from "../templates/pages/admin-plugin-settings.template";
import {
  Plugin,
  PluginsListPageData,
  renderPluginsListPage,
} from "../templates/pages/admin-plugins-list.template";
import type { Bindings, Variables } from "../app";

const adminPluginRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

// Available plugins registry - plugins that can be installed
const AVAILABLE_PLUGINS = [
  {
    id: "third-party-faq",
    name: "faq-plugin",
    display_name: "FAQ System",
    description:
      "Frequently Asked Questions management system with categories, search, and custom styling",
    version: "2.0.0",
    author: "Community Developer",
    category: "content",
    icon: "❓",
    permissions: ["manage:faqs"],
    dependencies: [],
    is_core: false,
  },
  {
    id: "demo-login-prefill",
    name: "demo-login-plugin",
    display_name: "Demo Login Prefill",
    description:
      "Prefills login form with demo credentials (admin@patro.io/patro!) for easy site demonstration",
    version: "1.0.0-beta.1",
    author: "PatroCMS",
    category: "demo",
    icon: "🎯",
    permissions: [],
    dependencies: [],
    is_core: false,
  },
  {
    id: "database-tools",
    name: "database-tools",
    display_name: "Database Tools",
    description:
      "Database management tools including truncate, backup, and validation",
    version: "1.0.0-beta.1",
    author: "The Patro Authors",
    category: "system",
    icon: "🗄️",
    permissions: ["manage:database", "admin"],
    dependencies: [],
    is_core: false,
  },
  {
    id: "seed-data",
    name: "seed-data",
    display_name: "Seed Data",
    description:
      "Generate realistic example users and content for testing and development",
    version: "1.0.0-beta.1",
    author: "The Patro Authors",
    category: "development",
    icon: "🌱",
    permissions: ["admin"],
    dependencies: [],
    is_core: false,
  },
  {
    id: "quill-editor",
    name: "quill-editor",
    display_name: "Quill Rich Text Editor",
    description:
      "Quill WYSIWYG editor integration for rich text editing. Lightweight, modern editor with customizable toolbars and dark mode support.",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "editor",
    icon: "✍️",
    permissions: [],
    dependencies: [],
    is_core: true,
  },
  {
    id: "easy-mdx",
    name: "easy-mdx",
    display_name: "EasyMDE Markdown Editor",
    description:
      "Lightweight markdown editor with live preview. Provides a simple and efficient editor with markdown support for richtext fields.",
    version: "1.0.0",
    author: "The Patro Authors",
    category: "editor",
    icon: "📝",
    permissions: [],
    dependencies: [],
    is_core: false,
  },
];

// Helper function to translate plugin names and descriptions
function translatePluginInfo(pluginId: string, field: 'name' | 'description', t: any, fallback: string): string {
  const keyMap: Record<string, string> = {
    'core-auth': 'coreAuth',
    'core-media': 'coreMedia',
    'database-tools': 'databaseTools',
    'seed-data': 'seedData',
    'core-cache': 'coreCache',
    'workflow-plugin': 'workflowPlugin',
    'third-party-faq': 'thirdPartyFaq',
    'demo-login-prefill': 'demoLoginPrefill',
    'quill-editor': 'quillEditor',
    'easy-mdx': 'easyMdx',
    'testimonials-plugin': 'testimonialsPlugin',
    'email': 'emailPlugin',
    'otp-login': 'otpLogin'
  };
  
  const key = keyMap[pluginId];
  if (key) {
    return t(`plugins.corePlugins.${key}.${field}`);
  }
  return fallback;
}

// Plugin list page
adminPluginRoutes.get("/", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const t = getTranslate(c);

  if (user?.role !== "admin") {
    return c.text("Access denied", 403);
  }

  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    const settingsService = yield* SettingsService;

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings();

    const installedPlugins = yield* 
      pluginService.getAllPlugins()
    ;

    const stats = yield* 
      pluginService.getPluginStats()
    ;

    const installedPluginIds = new Set(installedPlugins.map((p) => p.id));
    const uninstalledPlugins = AVAILABLE_PLUGINS.filter(
      (p) => !installedPluginIds.has(p.id)
    );

    const templatePlugins: Plugin[] = installedPlugins.map((p: any) => ({
      id: p.id,
      name: p.name,
      displayName: translatePluginInfo(p.id, 'name', t, p.display_name),
      description: translatePluginInfo(p.id, 'description', t, p.description),
      version: p.version,
      author: p.author,
      status: p.status,
      category: p.category,
      icon: p.icon,
      downloadCount: p.download_count,
      rating: p.rating,
      lastUpdated: formatLastUpdated(p.last_updated),
      dependencies: p.dependencies,
      permissions: p.permissions,
      isCore: p.is_core,
    }));

    const uninstalledTemplatePlugins: Plugin[] = uninstalledPlugins.map(
      (p) => ({
        id: p.id,
        name: p.name,
        displayName: translatePluginInfo(p.id, 'name', t, p.display_name),
        description: translatePluginInfo(p.id, 'description', t, p.description),
        version: p.version,
        author: p.author,
        status: "uninstalled" as const,
        category: p.category,
        icon: p.icon,
        downloadCount: 0,
        rating: 0,
        lastUpdated: "Not installed",
        dependencies: p.dependencies,
        permissions: p.permissions,
        isCore: p.is_core,
      })
    );

    const allPlugins = [...templatePlugins, ...uninstalledTemplatePlugins];
    stats.uninstalled = uninstalledPlugins.length;
    stats.total = installedPlugins.length + uninstalledPlugins.length;

    const pageData: PluginsListPageData = {
      plugins: allPlugins,
      stats,
      user: {
        name: user?.email || "User",
        email: user?.email || "",
        role: user?.role || "user",
      },
      version: c.get("appVersion"),
      logoUrl: appearanceSettings.logoUrl,
    };

    return c.html(renderPluginsListPage(pageData, t));
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)), // PluginService first (needs db directly)
    Effect.provide(makeAppLayer(db)), // ✅ Unified layer (provides DatabaseService + SettingsService)
    Effect.catchAll((error) => {
      console.error("Error loading plugins page:", error);
      return Effect.succeed(c.text("Internal server error", 500));
    })
  );

  return Effect.runPromise(program);
});

// Get plugin settings page
adminPluginRoutes.get("/:id", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const pluginId = c.req.param("id");

  if (user?.role !== "admin") {
    return c.redirect("/admin/plugins");
  }

  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    const settingsService = yield* SettingsService;
    const appearanceSettings = yield* settingsService.getAppearanceSettings();

    const plugin = yield* 
      pluginService.getPlugin(pluginId)
    ;

    if (!plugin) {
      return c.text("Plugin not found", 404);
    }

    const activity = yield* 
      pluginService.getPluginActivity(pluginId, 20)
    ;

    const templatePlugin = {
      id: plugin.id,
      name: plugin.name,
      displayName: plugin.display_name,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
      status: plugin.status,
      category: plugin.category,
      icon: plugin.icon,
      downloadCount: plugin.download_count,
      rating: plugin.rating,
      lastUpdated: formatLastUpdated(plugin.last_updated),
      dependencies: plugin.dependencies,
      permissions: plugin.permissions,
      isCore: plugin.is_core,
      settings: plugin.settings,
    };

    const templateActivity = (activity || []).map((item: any) => ({
      id: item.id,
      action: item.action,
      message: item.message,
      timestamp: item.timestamp,
      user: item.user_email,
    }));

    const pageData: PluginSettingsPageData = {
      plugin: templatePlugin,
      activity: templateActivity,
      user: {
        name: user?.email || "User",
        email: user?.email || "",
        role: user?.role || "user",
      },
      logoUrl: appearanceSettings.logoUrl,
    };

    // Use translated `t` so layout + sidebar use the current locale
    const t = getTranslate(c);
    return c.html(renderPluginSettingsPage(pageData, t));
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)), // PluginService first
    Effect.provide(makeAppLayer(db)), // ✅ Unified layer (provides DatabaseService + SettingsService)
    Effect.catchAll((error) => {
      console.error("Error getting plugin settings page:", error);
      return Effect.succeed(c.text("Internal server error", 500));
    })
  );

  return Effect.runPromise(program);
});

// Activate plugin
adminPluginRoutes.post("/:id/activate", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const pluginId = c.req.param("id");

  if (user?.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    yield* pluginService.activatePlugin(pluginId);
    return c.json({ success: true });
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)),
    Effect.catchAll((error: any) => 
      Effect.succeed(c.json({ error: error.message || "Failed to activate plugin" }, 400))
    )
  );

  return Effect.runPromise(program);
});

// Deactivate plugin
adminPluginRoutes.post("/:id/deactivate", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const pluginId = c.req.param("id");

  if (user?.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    yield* pluginService.deactivatePlugin(pluginId);
    return c.json({ success: true });
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)),
    Effect.catchAll((error: any) => 
      Effect.succeed(c.json({ error: error.message || "Failed to deactivate plugin" }, 400))
    )
  );

  return Effect.runPromise(program);
});

// Install plugin
adminPluginRoutes.post("/install", (c) => {
  const user = c.get("user");
  const db = c.env.DB;

  if (user?.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  const program = Effect.gen(function* (_) {
    const body = yield* Effect.tryPromise(() => c.req.json());
    const pluginService = yield* PluginService;
    let pluginData: any;

    const pluginDefinition = AVAILABLE_PLUGINS.find((p) => p.name === body.name);
    if (pluginDefinition) {
      // Base settings can be expanded here based on plugin name
      pluginData = { ...pluginDefinition, settings: {} };
    } else {
      return c.json({ error: "Plugin not found in registry" }, 404);
    }

    const plugin = yield* 
      pluginService.installPlugin(pluginData)
    ;
    return c.json({ success: true, plugin });
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)),
    Effect.catchAll((error: any) => {
      console.error("Error installing plugin:", error);
      return Effect.succeed(c.json({ error: error.message || "Failed to install plugin" }, 400));
    })
  );

  return Effect.runPromise(program);
});

// Uninstall plugin
adminPluginRoutes.post("/:id/uninstall", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const pluginId = c.req.param("id");

  if (user?.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService;
    yield* pluginService.uninstallPlugin(pluginId);
    return c.json({ success: true });
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)),
    Effect.catchAll((error: any) => 
      Effect.succeed(c.json({ error: error.message || "Failed to uninstall plugin" }, 400))
    )
  );

  return Effect.runPromise(program);
});

// Update plugin settings
adminPluginRoutes.post("/:id/settings", (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const pluginId = c.req.param("id");

  if (user?.role !== "admin") {
    return c.json({ error: "Access denied" }, 403);
  }

  const program = Effect.gen(function* (_) {
    const settings = yield* Effect.tryPromise(() => c.req.json());
    const pluginService = yield* PluginService;
    yield* 
      pluginService.updatePluginSettings(pluginId, settings)
    ;
    return c.json({ success: true });
  }).pipe(
    Effect.provide(makePluginServiceLayer(db)),
    Effect.catchAll((error: any) => {
      console.error("Error updating plugin settings:", error);
      return Effect.succeed(c.json({ error: error.message || "Failed to update settings" }, 400));
    })
  );

  return Effect.runPromise(program);
});

// Helper function to format last updated time
function formatLastUpdated(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

export { adminPluginRoutes };
