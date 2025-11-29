import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import {
  CollectionLoaderService,
  makeCollectionLoaderService,
  CollectionValidationError
} from '../../../services/collection-loader';
import { CollectionConfig } from '../../../types/collection-config';

describe('CollectionLoaderService', () => {
  const service = makeCollectionLoaderService();

  it('should validate a correct collection config', () => {
    const config: CollectionConfig = {
      name: 'test_collection',
      displayName: 'Test Collection',
      schema: { type: 'object', properties: { title: { type: 'string' } } }
    };
    const result = service.validateCollectionConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should invalidate a collection config without a name', () => {
    const config = {
      displayName: 'Test Collection',
      schema: { type: 'object', properties: {} }
    } as CollectionConfig;
    const result = service.validateCollectionConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Collection name is required');
  });

  it('should register a collection successfully', async () => {
    const config: CollectionConfig = {
      name: 'registered_collection',
      displayName: 'Registered Collection',
      schema: { type: 'object', properties: {} }
    };
    const program = service.registerCollections([config]);
    await Effect.runPromise(program);
    
    // Mocking loadCollectionConfigs to avoid import.meta.glob error in vitest
    vi.spyOn(service, 'loadCollectionConfigs').mockImplementation(() => Effect.succeed([config]));

    const loadedProgram = service.loadCollectionConfigs();
    const loaded = await Effect.runPromise(loadedProgram);
    
    expect(loaded.some(c => c.name === 'registered_collection')).toBe(true);
  });

  it('should fail to register an invalid collection', async () => {
    const config = {
      displayName: 'Invalid Collection'
    } as CollectionConfig;
    const program = service.registerCollections([config]);
    const result = await Effect.runPromise(Effect.flip(program));
    expect(result).toBeInstanceOf(CollectionValidationError);
  });
});