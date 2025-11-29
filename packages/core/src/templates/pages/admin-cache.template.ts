/**
 * Cache Dashboard Template
 */

export interface CacheDashboardData {
  stats: Record<string, {
    memoryHits: number
    kvHits: number
    memoryMisses: number
    kvMisses: number
    memorySize: number
    entryCount: number
    hitRate: number
    totalRequests: number
    dbHits?: number
  }>
  totals: {
    hits: number
    misses: number
    requests: number
    hitRate: string
    memorySize: number
    entryCount: number
  }
  namespaces: string[]
  user?: {
    name: string
    email: string
    role: string
  }
  version?: string
}

export function renderCacheDashboard(data: CacheDashboardData): string {
  return `
    <!DOCTYPE html>
    <html lang="cs">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cache Dashboard - PatroCMS</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 dark:bg-gray-900">
      <div class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">Cache Dashboard</h1>
        
        <!-- Totals -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Hits</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${data.totals.hits.toLocaleString()}</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Misses</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${data.totals.misses.toLocaleString()}</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Hit Rate</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">${data.totals.hitRate}%</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Entry Count</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${data.totals.entryCount.toLocaleString()}</div>
          </div>
        </div>

        <!-- Namespace Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Cache Namespaces</h2>
          </div>
          <div class="p-6">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Namespace</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hit Rate</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entries</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Memory Size</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  ${data.namespaces.map(ns => {
                    const stats = data.stats[ns]
                    if (!stats) return ''
                    return `
                      <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${ns}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${stats.hitRate.toFixed(2)}%</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${stats.entryCount.toLocaleString()}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${(stats.memorySize / 1024).toFixed(2)} KB</td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}