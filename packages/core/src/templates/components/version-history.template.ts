export interface ContentVersion {
  id: string
  version: number
  data: any
  author_id: string
  author_name?: string
  created_at: number
  is_current?: boolean
}

export interface VersionHistoryData {
  contentId: string
  versions: ContentVersion[]
  currentVersion: number
}

export function renderVersionHistory(data: VersionHistoryData): string {
  return `
    <div class="version-history-modal">
      <div class="backdrop-blur-xl bg-white/10 rounded-xl border border-white/20 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <!-- Header -->
        <div class="relative px-6 py-4 border-b border-white/10">
          <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10"></div>
          <div class="relative flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Version History</h3>
            <button onclick="closeVersionHistory()" class="text-gray-300 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Versions List -->
        <div class="overflow-y-auto max-h-[calc(90vh-120px)]">
          <div class="p-6 space-y-4">
            ${data.versions.map((version, index) => `
              <div class="version-item backdrop-blur-sm bg-white/5 rounded-xl border border-white/10 p-4 ${version.is_current ? 'ring-2 ring-blue-500/50' : ''}">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center space-x-3">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${version.is_current ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-gray-300'}">
                      Version ${version.version}${version.is_current ? ' (Current)' : ''}
                    </span>
                    <span class="text-sm text-gray-300">
                      ${new Date(version.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div class="flex items-center space-x-2">
                    ${!version.is_current ? `
                      <button 
                        onclick="restoreVersion('${data.contentId}', ${version.version})"
                        class="inline-flex items-center px-3 py-1 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 transition-all"
                      >
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
                        </svg>
                        Restore
                      </button>
                    ` : ''}
                    <button 
                      onclick="previewVersion('${data.contentId}', ${version.version})"
                      class="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-all"
                    >
                      <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                      </svg>
                      Preview
                    </button>
                  </div>
                </div>
                
                <!-- Version Summary -->
                <div class="version-summary text-sm">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span class="text-gray-400">Title:</span>
                      <span class="text-white ml-2">${escapeHtml(version.data?.title || 'Untitled')}</span>
                    </div>
                    <div>
                      <span class="text-gray-400">Author:</span>
                      <span class="text-white ml-2">${escapeHtml(version.author_name || 'Unknown')}</span>
                    </div>
                    ${version.data?.excerpt ? `
                      <div class="md:col-span-2">
                        <span class="text-gray-400">Excerpt:</span>
                        <p class="text-white mt-1 text-xs">${escapeHtml(version.data.excerpt.substring(0, 200))}${version.data.excerpt.length > 200 ? '...' : ''}</p>
                      </div>
                    ` : ''}
                  </div>
                </div>
                
                <!-- Changes Summary (if not current) -->
                ${!version.is_current && index < data.versions.length - 1 ? `
                  <div class="mt-3 pt-3 border-t border-white/10">
                    <button 
                      onclick="toggleChanges('changes-${version.version}')"
                      class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path>
                      </svg>
                      View Changes
                    </button>
                    <div id="changes-${version.version}" class="hidden mt-2 text-xs text-gray-300">
                      <em>Change detection coming soon...</em>
                    </div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 border-t border-white/10 bg-white/5">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-400">
              ${data.versions.length} version${data.versions.length !== 1 ? 's' : ''} total
            </span>
            <button 
              onclick="closeVersionHistory()"
              class="px-4 py-2 bg-white/10 text-white rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <script>
      // Make functions globally available
      window.closeVersionHistory = function() {
        const modal = document.querySelector('.version-history-modal');
        if (modal && modal.closest('.fixed')) {
          modal.closest('.fixed').remove();
        }
      };
      
      window.restoreVersion = function(contentId, version) {
        if (confirm(\`Are you sure you want to restore to version \${version}? This will create a new version with the restored content.\`)) {
          // Show notification if available, otherwise use alert
          const notify = window.showNotification || ((msg) => alert(msg));
          
          fetch(\`/admin/content/\${contentId}/restore/\${version}\`, {
            method: 'POST'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              notify('Version restored successfully! Refreshing page...', 'success');
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } else {
              notify('Failed to restore version', 'error');
            }
          })
          .catch(error => {
            console.error('Error restoring version:', error);
            notify('Error restoring version', 'error');
          });
        }
      };
      
      window.previewVersion = function(contentId, version) {
        const preview = window.open('', '_blank');
        if (!preview) {
          alert('Please allow popups to preview versions');
          return;
        }
        
        preview.document.write('<html><head><title>Loading Preview...</title></head><body><p style="font-family: Arial; padding: 20px;">Loading version preview...</p></body></html>');
        
        fetch(\`/admin/content/\${contentId}/version/\${version}/preview\`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Preview failed');
          }
          return response.text();
        })
        .then(html => {
          preview.document.open();
          preview.document.write(html);
          preview.document.close();
        })
        .catch(error => {
          console.error('Preview error:', error);
          preview.document.open();
          preview.document.write('<html><head><title>Preview Error</title></head><body><p style="font-family: Arial; padding: 20px; color: red;">Error loading preview. Please try again.</p></body></html>');
          preview.document.close();
        });
      };
      
      window.toggleChanges = function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
          element.classList.toggle('hidden');
        }
      };
    </script>
  `
}

function escapeHtml(text: string): string {
  if (typeof text !== 'string') return String(text || '')
  return text.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char))
}