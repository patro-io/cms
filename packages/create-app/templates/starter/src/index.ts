/**
 * My PatroCMS Application
 *
 * Entry point for your PatroCMS headless CMS application
 */

import { createPatroCMSApp, registerCollections } from '@patro-io/cms'
import type { PatroCMSConfig } from '@patro-io/cms'
import blogPostsCollection from './collections/blog-posts.collection'

// Register collections before app creation
// This ensures they are available during bootstrap
registerCollections([blogPostsCollection])

// Application configuration
const config: PatroCMSConfig = {
  collections: {
    autoSync: true
  },
  plugins: {
    directory: './src/plugins',
    autoLoad: false  // Set to true to auto-load custom plugins
  }
}

// Create and export the application
export default createPatroCMSApp(config)
