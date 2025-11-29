/**
 * Utils Module Exports
 *
 * Utility functions for PatroCMS
 */

// HTML Sanitization Utilities (Effect-based)
export { escapeHtml, sanitizeInput, sanitizeObject } from "./sanitize";

// Template Rendering (Effect-based)
export {
  clearCache, makeTemplateRendererServiceLayer,
  render, renderTemplateStandalone,
  TemplateRendererService,
  TemplateRendererServiceLive
} from "./template-renderer";

// Query Filter Builder (Effect-based)
export {
  buildQueryEffect, buildQueryFromFilter, parseFromQueryEffect, type FilterCondition,
  type FilterGroup,
  type FilterOperator,
  type QueryFilter,
  type QueryResult
} from "./query-filter";

// Metrics Tracking (Effect-based)
export {
  clearMetrics, getAverageRPS, getRequestsPerSecond,
  getTotalRequests, makeMetricsServiceLayer, MetricsService,
  MetricsServiceLive, recordRequest
} from "./metrics";

// Version Info
export { getCoreVersion, PATROCMS_VERSION } from "./version";
