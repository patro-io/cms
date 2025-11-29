/**
 * My PatroCMS Application
 *
 * Entry point for your PatroCMS headless CMS application
 */

import { createPatroCMSApp } from '@patro-io/cms'
import type { PatroCMSConfig } from '@patro-io/cms'

// Application configuration
const config: PatroCMSConfig = {
  collections: {
    directory: './src/collections',
    autoSync: true
  },
  plugins: {
    directory: './src/plugins',
    autoLoad: false  // Set to true to auto-load custom plugins
  }
}

// Create and export the application
export default createPatroCMSApp(config)
