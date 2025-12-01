import { PluginBuilder } from '../../sdk/plugin-builder'
import type { Plugin, PluginContext, HookHandler } from '@patro-io/cms'

/**
 * Demo Login Plugin
 *
 * ⚠️ SECURITY WARNING: This plugin is for DEMO/DEVELOPMENT purposes only!
 *
 * Prefills the login form with demo credentials (demo@example.com/demo123!)
 * when activated, making it easy for demo site visitors to log in.
 *
 * DO NOT use this plugin in production with real admin accounts!
 * Create a dedicated demo user account if you need this functionality.
 */

const demoLoginAssets = {
  js: `
    // Demo Login Prefill Script
    (function() {
      'use strict';
      
      function prefillLoginForm() {
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        
        if (emailInput && passwordInput) {
          emailInput.value = 'demo@example.com';
          passwordInput.value = 'demo123!';
          
          // Add visual indication that form is prefilled
          const form = emailInput.closest('form');
          if (form) {
            const notice = document.createElement('div');
            notice.className = 'mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-900 text-sm';
            notice.innerHTML = '⚠️ <strong>Demo Mode Active:</strong> Login form prefilled with demo credentials (demo@example.com/demo123!)';
            form.insertBefore(notice, form.firstChild);
          }
        }
      }
      
      // Prefill on page load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', prefillLoginForm);
      } else {
        prefillLoginForm();
      }
      
      // Also handle HTMX page changes (for SPA-like navigation)
      document.addEventListener('htmx:afterSwap', function(event) {
        if (event.detail.target.id === 'main-content' || 
            document.getElementById('email')) {
          setTimeout(prefillLoginForm, 100);
        }
      });
    })();
  `
}

const loginPrefillHook: HookHandler = async (data: any, _context: any) => {
  // Add demo login script to pages that contain login forms
  if (data.pageType === 'auth-login' || data.template?.includes('login')) {
    if (!data.scripts) {
      data.scripts = []
    }
    
    // Add inline script for login prefill
    data.inlineScripts = data.inlineScripts || []
    data.inlineScripts.push(demoLoginAssets.js)
  }
  
  return data
}

const demoLoginPlugin = PluginBuilder.create({
  name: 'demo-login-plugin',
  version: '1.0.0-beta.1',
  description: '⚠️ DEMO ONLY: Prefills login with demo@example.com/demo123! - NOT for production!',
  author: {
    name: 'PatroCMS'
  }
})
  .addHook('template:render', loginPrefillHook)
  .addHook('page:before-render', loginPrefillHook)
  .metadata({
    description: '⚠️ DEMO/DEV ONLY: Prefills login form with demo credentials (demo@example.com/demo123!). Create dedicated demo user to use this plugin.',
    author: {
      name: 'PatroCMS'
    },
    dependencies: []
  })
  .build() as Plugin

export { demoLoginPlugin }