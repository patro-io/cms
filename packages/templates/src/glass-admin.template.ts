/**
 * Glass Admin Template - Demo Template
 * This is a standalone demo template for showcasing the glass morphism design
 */

/**
 * Inline logo SVG for demo template (standalone, no dependencies)
 */
function renderDemoLogo(): string {
  return `
    <svg class="h-8 w-auto" viewBox="0 0 543 85" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path fill="#ffffff" d="m58.88 29.24c0 22.8-17.26 26.4-26 26.4h-12.59v25.89h-19.67v-78.68h32.26c8.74 0 26 3.6 26 26.39zm-20.8 0.01c0-7.54-4.95-9.77-9.93-9.77h-7.86v19.53h7.86c4.98 0 9.93-2.22 9.93-9.76z"></path>
      <path fill="#ffffff" d="m105.11 28.12h18.57v53.55h-18.57v-4.63c-4.46 4.11-10.19 6.58-16.44 6.58-14.21 0-25.73-12.77-25.73-28.52 0-15.76 11.52-28.53 25.73-28.53 6.25 0 11.98 2.48 16.44 6.59zm0 26.97c0-6.78-4.82-12.27-11.32-12.27-6.5 0-11.77 5.49-11.77 12.27 0 6.78 5.27 12.28 11.77 12.28 6.5 0 11.32-5.5 11.32-12.28z"></path>
      <path fill="#ffffff" d="m173.24 68.19v15.42c-10.87 0-27.94-2.3-27.94-20.9v-18.13h-5.87v-16.38h5.87v-16.04h18.57v47.29c0 3.19 1.73 8.74 9.37 8.74z"></path>
      <path fill="#06b6d4" d="m160.05 36.88c0-5.86 4.6-10.62 10.29-10.62 5.68 0 10.29 4.76 10.29 10.62 0 5.87-4.61 10.63-10.29 10.63-5.69 0-10.29-4.76-10.29-10.63z"></path>
      <path fill="#ffffff" d="m200.08 81.6v-53.43h18.58v53.43z"></path>
      <path fill="#06b6d4" d="m214.08 36.89c0-5.87 4.61-10.63 10.29-10.63 5.69 0 10.3 4.76 10.3 10.63 0 5.87-4.61 10.62-10.3 10.62-5.68 0-10.29-4.75-10.29-10.62z"></path>
      <path fill="#ffffff" d="m298.21 54.93c0 15.84-12.35 28.83-31.27 28.83-18.91 0-31.26-12.99-31.26-28.83 0-15.85 12.35-28.7 31.26-28.7 18.92 0 31.27 12.85 31.27 28.7zm-19.39 0.07c0-6.86-5.32-12.42-11.88-12.42-6.55 0-11.87 5.56-11.87 12.42 0 6.85 5.32 12.41 11.87 12.41 6.56 0 11.88-5.56 11.88-12.41z"></path>
      <path fill="#ffffff" d="m381.15 62.53c-6.66 12.91-19.78 21.66-36.02 21.66-25.73 0-40.78-18.66-40.78-41.69 0-23.03 15.05-41.69 40.78-41.69 16.2 0 29.15 8.56 35.83 21.24l-19.36 8.19c-3.26-7.02-9.35-11.73-16.92-11.73-12.32 0-19.51 10.74-19.51 23.99 0 13.25 7.19 23.99 19.51 23.99 7.55 0 13.69-4.77 16.96-11.87z"></path>
      <path fill="#ffffff" d="m481.3 81.53h-19.67l-6.82-44.45-12.73 32.69-4.57 11.76h-8.66l-4.58-11.76-12.73-32.69-6.82 44.45h-19.67l13.16-78.67v-0.01h18.58 1.09l15.3 42.29 15.29-42.29h1.09 18.58z"></path>
      <path fill="#ffffff" d="m542.38 57.05c0 18.2-14.32 26.66-29.64 26.66-15.32 0-26.9-8.85-26.9-8.85l8.53-16.46c5.18 5.42 13.64 8 18.37 8 4.73 0 8.73-3.66 8.73-7.48 0-13.85-32.48-5.1-32.48-32.28 0-17.43 12.48-25.83 26.49-25.83 13.51 0 23.75 6.35 23.75 6.35l-7.92 15.94c0 0-6.62-5.32-12.79-5.32-4.6 0-8.72 1.71-8.72 6.77 0 11.77 32.57 4.2 32.58 32.5z"></path>
    </svg>
  `
}

export function renderGlassAdminTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Glass Admin Template - Dark Mode</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    backdropBlur: {
                        xs: '2px',
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-gradient-to-br from-gray-900 via-purple-900 to-violet-800 min-h-screen">
    <!-- Background overlay with glass effect -->
    <div class="fixed inset-0 bg-black/20 backdrop-blur-sm"></div>
    
    <!-- Main container -->
    <div class="relative z-10 min-h-screen">
        <!-- Header -->
        <header class="backdrop-blur-md bg-white/10 border-b border-white/20 shadow-lg relative z-[9998]">
            <div class="px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center py-4">
                    <div class="flex items-center space-x-4">
                        ${renderDemoLogo()}
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <!-- Notifications -->
                        <button class="p-2 text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-white/10 relative">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5l-5-5h5V3h0v14z"/>
                            </svg>
                            <span class="absolute top-1 right-1 w-2 h-2 bg-red-400 rounded-full"></span>
                        </button>
                        
                        <!-- User Dropdown -->
                        <div class="relative z-[9999]">
                            <button class="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/10 transition-colors group" onclick="toggleUserDropdown()">
                                <div class="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                                    <span class="text-white text-sm font-medium">JD</span>
                                </div>
                                <div class="hidden md:block text-left">
                                    <div class="text-white text-sm font-medium">John Doe</div>
                                    <div class="text-gray-400 text-xs">Administrator TS</div>
                                </div>
                                <svg class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </button>
                            
                            <!-- Dropdown Menu -->
                            <div id="userDropdown" class="hidden absolute right-0 mt-2 w-48 backdrop-blur-md bg-black/95 rounded-xl border border-white/10 shadow-xl z-[9999]">
                                <div class="py-2">
                                    <a href="#" class="flex items-center px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                        </svg>
                                        Edit Profile
                                    </a>
                                    <a href="#" class="flex items-center px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        </svg>
                                        Account Settings
                                    </a>
                                    <a href="#" class="flex items-center px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                        </svg>
                                        Documentation
                                    </a>
                                    <a href="#" class="flex items-center px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
                                        </svg>
                                        Help & Support
                                    </a>
                                    <hr class="my-2 border-white/10">
                                    <a href="#" class="flex items-center px-4 py-2 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors">
                                        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                                        </svg>
                                        Logout
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
        
        <script>
            function toggleUserDropdown() {
                const dropdown = document.getElementById('userDropdown');
                dropdown.classList.toggle('hidden');
            }
            
            // Close dropdown when clicking outside
            document.addEventListener('click', function(event) {
                const dropdown = document.getElementById('userDropdown');
                const button = event.target.closest('button');
                if (!button || !button.getAttribute('onclick')) {
                    dropdown.classList.add('hidden');
                }
            });
        </script>

        <!-- Main content area -->
        <div class="px-4 sm:px-6 lg:px-8 py-8">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <!-- Sidebar -->
                <div class="lg:col-span-1">
                    <nav class="backdrop-blur-md bg-black/30 rounded-xl border border-white/10 shadow-xl p-6 h-[calc(100vh-9.5rem)] sticky top-8">
                        <div class="space-y-4">
                            <a href="#" class="flex items-center space-x-3 text-white bg-white/20 rounded-lg px-3 py-2 transition-all hover:bg-white/30">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                                </svg>
                                <span>Dashboard</span>
                            </a>
                            <a href="#" class="flex items-center space-x-3 text-gray-300 hover:text-white rounded-lg px-3 py-2 transition-all hover:bg-white/10">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                                </svg>
                                <span>Users</span>
                            </a>
                            <a href="#" class="flex items-center space-x-3 text-gray-300 hover:text-white rounded-lg px-3 py-2 transition-all hover:bg-white/10">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Analytics</span>
                            </a>
                            <a href="#" class="flex items-center space-x-3 text-gray-300 hover:text-white rounded-lg px-3 py-2 transition-all hover:bg-white/10">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
                                </svg>
                                <span>Settings</span>
                            </a>
                        </div>
                    </nav>
                </div>

                <!-- Main content -->
                <div class="lg:col-span-4">
                    <!-- Stats cards -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <div class="backdrop-blur-md bg-black/20 rounded-xl border border-white/10 shadow-xl p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-300 text-sm">Total Users</p>
                                    <p class="text-white text-2xl font-bold">2,847</p>
                                </div>
                                <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div class="backdrop-blur-md bg-black/20 rounded-xl border border-white/10 shadow-xl p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-300 text-sm">Revenue</p>
                                    <p class="text-white text-2xl font-bold">$48,392</p>
                                </div>
                                <div class="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-500 rounded-lg flex items-center justify-center">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div class="backdrop-blur-md bg-black/20 rounded-xl border border-white/10 shadow-xl p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-300 text-sm">Orders</p>
                                    <p class="text-white text-2xl font-bold">1,429</p>
                                </div>
                                <div class="w-12 h-12 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 2L3 7v11a1 1 0 001 1h12a1 1 0 001-1V7l-7-5zM10 12a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div class="backdrop-blur-md bg-black/20 rounded-xl border border-white/10 shadow-xl p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-300 text-sm">Growth</p>
                                    <p class="text-white text-2xl font-bold">+24%</p>
                                </div>
                                <div class="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Data table -->
                    <div class="backdrop-blur-md bg-black/20 rounded-xl border border-white/10 shadow-xl overflow-hidden">
                        <div class="px-6 py-4 border-b border-white/10">
                            <h3 class="text-lg font-semibold text-white">Recent Activity</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-white/5">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/10">
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div class="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full mr-3"></div>
                                                <div class="text-sm font-medium text-white">John Doe</div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">Login</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">2 hours ago</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-400/20 text-green-300">Success</span>
                                        </td>
                                    </tr>
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full mr-3"></div>
                                                <div class="text-sm font-medium text-white">Jane Smith</div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">Purchase</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">3 hours ago</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-400/20 text-blue-300">Completed</span>
                                        </td>
                                    </tr>
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div class="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full mr-3"></div>
                                                <div class="text-sm font-medium text-white">Mike Johnson</div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">Failed Login</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">5 hours ago</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-400/20 text-red-300">Failed</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`
}