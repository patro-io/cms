import { Context, Next } from "hono";
import { Effect, Layer } from "effect";
import {
  CollectionSyncService,
  makeCollectionSyncServiceLayer,
} from "../services/collection-sync";
import { MigrationService, makeMigrationServiceLayer } from "../services/migrations";
import { PluginBootstrapService, makePluginBootstrapServiceLayer } from "../services/plugin-bootstrap";
import type { PatroCMSConfig } from "../app";
import { makeDatabaseLayer } from "../services/database-effect";
import { makeCollectionLoaderServiceLayer } from "../services/collection-loader";
import { makePluginServiceLayer } from "../services/plugin-service";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
};

let bootstrapComplete = false;

export function bootstrapMiddleware(config: PatroCMSConfig = {}) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    if (bootstrapComplete) {
      return next();
    }

    const path = c.req.path;
    if (
      path.startsWith("/images/") ||
      path.startsWith("/assets/") ||
      path === "/health" ||
      path.endsWith(".js") ||
      path.endsWith(".css") ||
      path.endsWith(".png") ||
      path.endsWith(".jpg") ||
      path.endsWith(".ico")
    ) {
      return next();
    }

    const program = Effect.gen(function* (_) {
      console.log("[Bootstrap] Starting system initialization...");

      // Run database migrations using Pure Effect
      console.log("[Bootstrap] Running database migrations...");
      const migrationService = yield* MigrationService;
      yield* migrationService.runPendingMigrations();

      console.log("[Bootstrap] Syncing collection configurations...");
      const syncService = yield* CollectionSyncService;
      yield* syncService.syncCollections();

      if (!config.plugins?.disableAll) {
        console.log("[Bootstrap] Bootstrapping core plugins...");
        const bootstrapService = yield* PluginBootstrapService;
        const needsBootstrap = yield* bootstrapService.isBootstrapNeeded();
        if (needsBootstrap) {
          yield* bootstrapService.bootstrapCorePlugins();
        }
      } else {
        console.log("[Bootstrap] Plugin bootstrap skipped (disableAll is true)");
      }

      console.log("[Bootstrap] System initialization completed");
    });

    const dbLayer = makeDatabaseLayer(c.env.DB);
    const pluginLayer = makePluginServiceLayer(c.env.DB);
    const migrationLayer = makeMigrationServiceLayer();
    const bootstrapLayer = makePluginBootstrapServiceLayer();
    const collectionLoaderLayer = makeCollectionLoaderServiceLayer();
    const collectionSyncLayer = makeCollectionSyncServiceLayer();

    // Compose layers - provide dependencies in order
    const runnable = program.pipe(
      Effect.provide(collectionSyncLayer),
      Effect.provide(collectionLoaderLayer),
      Effect.provide(bootstrapLayer),
      Effect.provide(migrationLayer),
      Effect.provide(pluginLayer),
      Effect.provide(dbLayer)
    );

    try {
      await Effect.runPromise(runnable);
      bootstrapComplete = true;
    } catch (error) {
      console.error("[Bootstrap] Error during system initialization:", error);
    }

    return next();
  };
}

export function resetBootstrap() {
  bootstrapComplete = false;
}
