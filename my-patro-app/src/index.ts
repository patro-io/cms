/**
 * My PatroCMS Application
 *
 * Entry point for your PatroCMS headless CMS application
 */

import { createPatroCMSApp, PatroCMSConfig, CollectionLoaderService, makeCollectionLoaderServiceLayer } from '@patro-io/cms'
import { Effect, Layer } from 'effect'

// Import custom collections
import blogPostsCollection from './collections/blog-posts.collection'
import pagesCollection from './collections/pages.collection'
import newsCollection from './collections/news.collection'

// Create a program to register collections
const registerCollectionsProgram = Effect.gen(function* (_) {
  const collectionLoader = yield* _(CollectionLoaderService);
  yield* _(collectionLoader.registerCollections([
    blogPostsCollection,
    pagesCollection,
    newsCollection
  ]));
});

// Create a runnable to execute the program
const runnable = Effect.provide(registerCollectionsProgram, makeCollectionLoaderServiceLayer()).pipe(
  Effect.catchAll(error => Effect.logError(error))
);

// Run the registration program
Effect.runFork(runnable);

// Application configuration
const config: PatroCMSConfig = {
  collections: {
    autoSync: true
  },
  plugins: {
    directory: './src/plugins',
    autoLoad: false,  // Set to true to auto-load custom plugins
    disableAll: false,  // Enable plugins
    // enabled: ['email']  // This property is not supported in PatroCMSConfig
  }
}

// Create and export the application
export default createPatroCMSApp(config)
