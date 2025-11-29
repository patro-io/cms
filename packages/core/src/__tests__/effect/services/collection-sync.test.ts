import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  CollectionSyncService,
  makeCollectionSyncService,
  CollectionSyncError
} from '../../../services/collection-sync';
import { CollectionLoaderService, makeCollectionLoaderServiceLayer } from '../../../services/collection-loader';
import { DatabaseService, makeDatabaseLayer } from '../../../services/database-effect';
import { CollectionConfig } from '../../../types/collection-config';

describe('CollectionSyncService', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn()
  };

  const testConfig: CollectionConfig = {
    name: 'test_sync_collection',
    displayName: 'Test Sync Collection',
    schema: { type: 'object', properties: {} }
  };

  const loaderLayer = makeCollectionLoaderServiceLayer();

  const dbLayer = makeDatabaseLayer(mockDb as any);

  it('should sync a new collection', async () => {
    mockDb.first.mockResolvedValue(null);
    mockDb.run.mockResolvedValue({ success: true });

    const program = Effect.gen(function* (_) {
      const service = yield* CollectionSyncService;
      return yield* service.syncCollection(testConfig);
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.succeed(CollectionSyncService, makeCollectionSyncService())),
        Effect.provide(loaderLayer),
        Effect.provide(dbLayer)
      )
    );

    expect(result.status).toBe('created');
  });

  it('should update an existing collection', async () => {
    mockDb.first.mockResolvedValue({ id: '123', name: 'test_sync_collection', schema: '{}' });
    mockDb.run.mockResolvedValue({ success: true });

    const program = Effect.gen(function* (_) {
      const service = yield* CollectionSyncService;
      return yield* service.syncCollection(testConfig);
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.succeed(CollectionSyncService, makeCollectionSyncService())),
        Effect.provide(loaderLayer),
        Effect.provide(dbLayer)
      )
    );

    expect(result.status).toBe('updated');
  });
});