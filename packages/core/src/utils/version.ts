/**
 * Version utility
 *
 * Provides the current version of @patro-io/cms package
 */

import pkg from '../../package.json'

export const PATROCMS_VERSION = pkg.version

/**
 * Get the current PatroCMS core version
 */
export function getCoreVersion(): string {
  return PATROCMS_VERSION
}
