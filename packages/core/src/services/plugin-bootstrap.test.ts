import { describe, it, expect, vi } from "vitest";
import { Effect } from "effect";
import { makePluginBootstrapService } from "./plugin-bootstrap";
import { PluginService, type PluginData } from "./plugin-service";
import { DatabaseService } from "./database-effect";

interface MockServices {
  pluginService: any;
  databaseService: any;
  installPluginMock: ReturnType<typeof vi.fn>;
  getPluginMock: ReturnType<typeof vi.fn>;
  activatePluginMock: ReturnType<typeof vi.fn>;
}

function createMockServices(pluginMap: Record<string, PluginData | null>): MockServices {
  const installPluginMock = vi.fn((data: Partial<PluginData>) =>
    Effect.succeed({
      ...(data as PluginData),
      id: data.id ?? "generated-id",
      name: data.name ?? "generated-name",
      display_name: data.display_name ?? "Generated Plugin",
      description: data.description ?? "",
      version: data.version ?? "1.0.0",
      author: data.author ?? "test",
      category: data.category ?? "test",
      icon: data.icon ?? "🔌",
      status: (data as PluginData).status ?? "inactive",
      is_core: (data as PluginData).is_core ?? false,
      settings: data.settings ?? {},
      permissions: data.permissions ?? [],
      dependencies: data.dependencies ?? [],
      download_count: (data as PluginData).download_count ?? 0,
      rating: (data as PluginData).rating ?? 0,
      installed_at: (data as PluginData).installed_at ?? Math.floor(Date.now() / 1000),
      activated_at: (data as PluginData).activated_at,
      last_updated: (data as PluginData).last_updated ?? Math.floor(Date.now() / 1000),
      error_message: (data as PluginData).error_message,
    })
  );

  const getPluginMock = vi.fn((id: string) => {
    const plugin = pluginMap[id] ?? null;
    return Effect.succeed(plugin);
  });

  const activatePluginMock = vi.fn((_id: string) => Effect.succeed(undefined));

  const pluginServiceImpl = {
    getAllPlugins: () => Effect.succeed([]),
    getPlugin: (id: string) => getPluginMock(id),
    getPluginByName: () => Effect.succeed(null),
    getPluginStats: () =>
      Effect.succeed({ total: 0, active: 0, inactive: 0, errors: 0, uninstalled: 0 }),
    installPlugin: (data: Partial<PluginData>) => installPluginMock(data),
    uninstallPlugin: () => Effect.succeed(undefined),
    activatePlugin: (id: string) => activatePluginMock(id),
    deactivatePlugin: () => Effect.succeed(undefined),
    updatePluginSettings: () => Effect.succeed(undefined),
    setPluginError: () => Effect.succeed(undefined),
    getPluginActivity: () => Effect.succeed([]),
    registerHook: () => Effect.succeed(undefined),
    registerRoute: () => Effect.succeed(undefined),
    getPluginHooks: () => Effect.succeed([]),
    getPluginRoutes: () => Effect.succeed([]),
  };

  const pluginService = PluginService.of(pluginServiceImpl as any);

  const databaseService = {
    query: () => Effect.succeed([]),
    queryFirst: () => Effect.succeed(null),
    execute: () =>
      Effect.succeed({ success: true, changes: 0, duration: 0, lastRowId: 0 }),
    insert: () => Effect.fail(new Error("not used") as any),
    update: () => Effect.fail(new Error("not used") as any),
  };

  return {
    pluginService,
    databaseService,
    installPluginMock,
    getPluginMock,
    activatePluginMock,
  };
}

async function runWithEnv<T>(
  effect: Effect.Effect<T, any, any>,
  services: MockServices
): Promise<T> {
  const provided = effect.pipe(
    Effect.provideService(PluginService, services.pluginService as any),
    Effect.provideService(DatabaseService, services.databaseService as any)
  ) as Effect.Effect<T, any, never>;

  return await Effect.runPromise(provided);
}

describe("PluginBootstrapService", () => {
  it("isBootstrapNeeded vrátí true pro čistou DB (žádné core pluginy)", async () => {
    const services = createMockServices({});
    const bootstrapService = makePluginBootstrapService();

    const needsBootstrap = await runWithEnv(
      bootstrapService.isBootstrapNeeded(),
      services
    );

    expect(needsBootstrap).toBe(true);
  });

  it("bootstrapCorePlugins nainstaluje všechny core pluginy včetně AI Translatoru na čisté DB", async () => {
    const services = createMockServices({});
    const bootstrapService = makePluginBootstrapService();

    await runWithEnv(bootstrapService.bootstrapCorePlugins(), services);

    const installedIds = services.installPluginMock.mock.calls.map(
      (args) => (args[0] as Partial<PluginData>).id
    );

    expect(installedIds).toContain("core-auth");
    expect(installedIds).toContain("core-media");
    expect(installedIds).toContain("database-tools");
    expect(installedIds).toContain("seed-data");
    expect(installedIds).toContain("core-cache");
    expect(installedIds).toContain("workflow-plugin");
    expect(installedIds).toContain("ai-translator");

    const corePluginCalls = services.installPluginMock.mock.calls;
    for (const call of corePluginCalls) {
      const data = call[0] as Partial<PluginData>;
      expect(data.is_core).toBe(true);
    }
  });

  it("isBootstrapNeeded vrátí true, pokud chybí pouze AI Translator", async () => {
    const now = Math.floor(Date.now() / 1000);
    const basePlugin: Omit<PluginData, "id" | "name" | "display_name"> = {
      description: "",
      version: "1.0.0",
      author: "test",
      category: "test",
      icon: "🔌",
      status: "active",
      is_core: true,
      settings: {},
      permissions: [],
      dependencies: [],
      download_count: 0,
      rating: 0,
      installed_at: now,
      activated_at: now,
      last_updated: now,
      error_message: undefined,
    };

    const services = createMockServices({
      "core-auth": {
        id: "core-auth",
        name: "core-auth",
        display_name: "Authentication System",
        ...basePlugin,
      },
      "core-media": {
        id: "core-media",
        name: "core-media",
        display_name: "Media Manager",
        ...basePlugin,
      },
      "database-tools": {
        id: "database-tools",
        name: "database-tools",
        display_name: "Database Tools",
        ...basePlugin,
      },
      "seed-data": {
        id: "seed-data",
        name: "seed-data",
        display_name: "Seed Data",
        ...basePlugin,
      },
      "core-cache": {
        id: "core-cache",
        name: "core-cache",
        display_name: "Cache System",
        ...basePlugin,
      },
      "workflow-plugin": {
        id: "workflow-plugin",
        name: "workflow-plugin",
        display_name: "Workflow Management",
        ...basePlugin,
      },
      // "ai-translator" záměrně chybí
    });

    const bootstrapService = makePluginBootstrapService();

    const needsBootstrap = await runWithEnv(
      bootstrapService.isBootstrapNeeded(),
      services
    );

    expect(needsBootstrap).toBe(true);
  });

  it("opakovaný bootstrap je idempotentní, když všechny core pluginy existují", async () => {
    const now = Math.floor(Date.now() / 1000);
    const basePlugin: Omit<PluginData, "id" | "name" | "display_name"> = {
      description: "",
      version: "1.0.0-beta.1",
      author: "test",
      category: "test",
      icon: "🔌",
      status: "active",
      is_core: true,
      settings: {},
      permissions: [],
      dependencies: [],
      download_count: 0,
      rating: 0,
      installed_at: now,
      activated_at: now,
      last_updated: now,
      error_message: undefined,
    };

    const services = createMockServices({
      "core-auth": {
        id: "core-auth",
        name: "core-auth",
        display_name: "Authentication System",
        ...basePlugin,
      },
      "core-media": {
        id: "core-media",
        name: "core-media",
        display_name: "Media Manager",
        ...basePlugin,
      },
      "database-tools": {
        id: "database-tools",
        name: "database-tools",
        display_name: "Database Tools",
        ...basePlugin,
      },
      "seed-data": {
        id: "seed-data",
        name: "seed-data",
        display_name: "Seed Data",
        ...basePlugin,
      },
      "core-cache": {
        id: "core-cache",
        name: "core-cache",
        display_name: "Cache System",
        ...basePlugin,
      },
      "workflow-plugin": {
        id: "workflow-plugin",
        name: "workflow-plugin",
        display_name: "Workflow Management",
        ...basePlugin,
      },
      "ai-translator": {
        id: "ai-translator",
        name: "ai-translator",
        display_name: "AI Translator",
        ...basePlugin,
      },
    });

    const bootstrapService = makePluginBootstrapService();

    const needsBootstrap = await runWithEnv(
      bootstrapService.isBootstrapNeeded(),
      services
    );
    expect(needsBootstrap).toBe(false);

    await runWithEnv(bootstrapService.bootstrapCorePlugins(), services);
    await runWithEnv(bootstrapService.bootstrapCorePlugins(), services);

    expect(services.installPluginMock).not.toHaveBeenCalled();
  });

  it("bootstrapCorePlugins doplní pouze chybějící AI Translator na existující instalaci", async () => {
    const now = Math.floor(Date.now() / 1000);
    const basePlugin: Omit<PluginData, "id" | "name" | "display_name"> = {
      description: "",
      version: "1.0.0",
      author: "test",
      category: "test",
      icon: "🔌",
      status: "active",
      is_core: true,
      settings: {},
      permissions: [],
      dependencies: [],
      download_count: 0,
      rating: 0,
      installed_at: now,
      activated_at: now,
      last_updated: now,
      error_message: undefined,
    };

    const services = createMockServices({
      "core-auth": {
        id: "core-auth",
        name: "core-auth",
        display_name: "Authentication System",
        ...basePlugin,
      },
      "core-media": {
        id: "core-media",
        name: "core-media",
        display_name: "Media Manager",
        ...basePlugin,
      },
      "database-tools": {
        id: "database-tools",
        name: "database-tools",
        display_name: "Database Tools",
        ...basePlugin,
      },
      "seed-data": {
        id: "seed-data",
        name: "seed-data",
        display_name: "Seed Data",
        ...basePlugin,
      },
      "core-cache": {
        id: "core-cache",
        name: "core-cache",
        display_name: "Cache System",
        ...basePlugin,
      },
      "workflow-plugin": {
        id: "workflow-plugin",
        name: "workflow-plugin",
        display_name: "Workflow Management",
        ...basePlugin,
      },
      // "ai-translator" záměrně chybí - simuluje upgrade scénář
    });

    const bootstrapService = makePluginBootstrapService();

    await runWithEnv(bootstrapService.bootstrapCorePlugins(), services);

    // Ověř, že se nainstaloval pouze AI Translator
    expect(services.installPluginMock).toHaveBeenCalledTimes(1);
    
    const installedPlugin = services.installPluginMock.mock.calls[0]?.[0] as Partial<PluginData> | undefined;
    expect(installedPlugin).toBeDefined();
    expect(installedPlugin?.id).toBe("ai-translator");
    expect(installedPlugin?.name).toBe("ai-translator");
    expect(installedPlugin?.display_name).toBe("AI Translator");
    expect(installedPlugin?.is_core).toBe(true);
    
    // Ověř, že AI Translator byl aktivován
    expect(services.activatePluginMock).toHaveBeenCalledWith("ai-translator");
  });

  it("všechny core pluginy jsou aktivovány po instalaci", async () => {
    const services = createMockServices({});
    const bootstrapService = makePluginBootstrapService();

    await runWithEnv(bootstrapService.bootstrapCorePlugins(), services);

    // Ověř, že všechny core pluginy byly aktivovány
    const activatedIds = services.activatePluginMock.mock.calls.map(
      (args) => args[0] as string
    );

    expect(activatedIds).toContain("core-auth");
    expect(activatedIds).toContain("core-media");
    expect(activatedIds).toContain("database-tools");
    expect(activatedIds).toContain("seed-data");
    expect(activatedIds).toContain("core-cache");
    expect(activatedIds).toContain("workflow-plugin");
    expect(activatedIds).toContain("ai-translator");
  });
});