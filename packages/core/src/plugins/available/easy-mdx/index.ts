import { Plugin } from '../../../types/plugin'
import { PluginBuilder } from '../../sdk/plugin-builder'

/**
 * EasyMDE Markdown Editor Plugin
 *
 * Provides markdown editing capabilities for richtext fields.
 * When active, this plugin injects the EasyMDE editor into all richtext field types.
 * When inactive, richtext fields fall back to plain textareas.
 */

const builder = PluginBuilder.create({
  name: 'easy-mdx',
  version: '1.0.0',
  description: 'Lightweight markdown editor with live preview'
})

builder.metadata({
  author: {
    name: 'Patro',
    email: 'team@patro.io',
    url: 'https://patro.io'
  },
  license: 'MIT',
  compatibility: '^2.0.0'
})

builder.lifecycle({
  activate: async () => {
    console.info('✅ EasyMDE editor plugin activated')
  },
  deactivate: async () => {
    console.info('❌ EasyMDE editor plugin deactivated')
  }
})

const easyMdxPlugin = builder.build() as Plugin

export default easyMdxPlugin

/**
 * Get EasyMDE CDN script tags
 * @returns HTML script and style tags for EasyMDE
 */
export function getMDXEditorScripts(): string {
  return `
    <!-- EasyMDE Markdown Editor -->
    <link rel="stylesheet" href="https://unpkg.com/easymde/dist/easymde.min.css">
    <script src="https://unpkg.com/easymde/dist/easymde.min.js"></script>
    <style>
      /* Dark mode styling for EasyMDE */
      .EasyMDEContainer {
        background-color: #1e293b;
      }

      .EasyMDEContainer .CodeMirror {
        background-color: #1e293b;
        color: #e2e8f0;
        border-color: #334155;
      }

      .EasyMDEContainer .CodeMirror-scroll {
        background-color: #1e293b;
      }

      .EasyMDEContainer .CodeMirror-cursor {
        border-left-color: #e2e8f0;
      }

      .EasyMDEContainer .CodeMirror-gutters {
        background-color: #0f172a;
        border-right-color: #334155;
      }

      .EasyMDEContainer .CodeMirror-linenumber {
        color: #64748b;
      }

      .editor-toolbar {
        background-color: #0f172a;
        border-color: #334155;
      }

      .editor-toolbar button {
        color: #94a3b8 !important;
      }

      .editor-toolbar button:hover,
      .editor-toolbar button.active {
        background-color: #334155;
        border-color: #475569;
        color: #e2e8f0 !important;
      }

      .editor-toolbar i.separator {
        border-left-color: #334155;
        border-right-color: #334155;
      }

      .editor-statusbar {
        background-color: #0f172a;
        color: #64748b;
        border-top-color: #334155;
      }

      .editor-preview,
      .editor-preview-side {
        background-color: #1e293b;
        color: #e2e8f0;
      }

      .CodeMirror-selected {
        background-color: #334155 !important;
      }

      .CodeMirror-focused .CodeMirror-selected {
        background-color: #475569 !important;
      }

      /* Syntax highlighting for dark mode */
      .cm-header {
        color: #60a5fa;
      }

      .cm-strong {
        color: #fbbf24;
      }

      .cm-em {
        color: #a78bfa;
      }

      .cm-link {
        color: #34d399;
      }

      .cm-url {
        color: #34d399;
      }

      .cm-quote {
        color: #94a3b8;
        font-style: italic;
      }

      .cm-comment {
        color: #64748b;
      }
    </style>
  `
}

/**
 * Get EasyMDE initialization script
 * @param config - Optional configuration object
 * @returns JavaScript initialization code
 */
export function getMDXEditorInitScript(config?: {
  defaultHeight?: number
  toolbar?: string
  placeholder?: string
}): string {
  const defaultHeight = config?.defaultHeight || 400
  const toolbar = config?.toolbar || 'full'
  const placeholder = config?.placeholder || 'Start writing your content...'

  return `
    // Initialize EasyMDE (Markdown Editor) for all richtext fields
    function initializeMDXEditor() {
      console.log('🔍 [MDX DEBUG] ========== initializeMDXEditor called ==========');
      console.log('🔍 [MDX DEBUG] EasyMDE defined:', typeof EasyMDE !== 'undefined');
      
      if (typeof EasyMDE === 'undefined') {
        console.warn('⚠️ [MDX DEBUG] EasyMDE not loaded yet, retrying in 100ms...');
        setTimeout(initializeMDXEditor, 100);
        return;
      }

      // Find all textareas that need EasyMDE
      const containers = document.querySelectorAll('.richtext-container');
      console.log('🔍 [MDX DEBUG] Found', containers.length, 'richtext containers');
      
      const textareas = document.querySelectorAll('.richtext-container textarea');
      console.log('🔍 [MDX DEBUG] Found', textareas.length, 'textareas in richtext containers');
      
      textareas.forEach((textarea, index) => {
        console.log('🔍 [MDX DEBUG] ========== Processing textarea', index, '==========');
        console.log('🔍 [MDX DEBUG] Textarea ID:', textarea.id);
        console.log('🔍 [MDX DEBUG] Textarea name:', textarea.name);
        console.log('🔍 [MDX DEBUG] Textarea value length:', textarea.value?.length || 0);
        console.log('🔍 [MDX DEBUG] Textarea value preview:', textarea.value?.substring(0, 100) || '(empty)');
        console.log('🔍 [MDX DEBUG] Has existing instance:', !!textarea.easyMDEInstance);
        
        // If there's an existing instance, destroy it first (it might be stale)
        if (textarea.easyMDEInstance) {
          console.log('⚠️ [MDX DEBUG] Found existing instance, destroying it first...');
          try {
            textarea.easyMDEInstance.toTextArea();
            textarea.easyMDEInstance = null;
            // Show textarea again so we can reinitialize
            textarea.style.display = '';
            console.log('✅ [MDX DEBUG] Old instance destroyed successfully');
          } catch (e) {
            console.error('❌ [MDX DEBUG] Error destroying old instance:', e);
          }
        }

        // Get configuration from data attributes
        const container = textarea.closest('.richtext-container');
        console.log('🔍 [MDX DEBUG] Container found:', !!container);
        
        const height = container?.dataset.height || ${defaultHeight};
        const editorToolbar = container?.dataset.toolbar || '${toolbar}';
        console.log('🔍 [MDX DEBUG] Config - height:', height, 'toolbar:', editorToolbar);

        // Initialize EasyMDE
        try {
          console.log('🔍 [MDX DEBUG] Starting EasyMDE initialization...');
          
          // CRITICAL: Get the initial value BEFORE initializing EasyMDE
          const initialValue = textarea.value || '';
          console.log('🔍 [MDX DEBUG] Initial value captured, length:', initialValue.length);
          console.log('🔍 [MDX DEBUG] Initial value first 200 chars:', initialValue.substring(0, 200));
          
          const toolbarButtons = editorToolbar === 'minimal'
            ? ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'preview']
            : ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', 'table', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'];

          const easyMDE = new EasyMDE({
            element: textarea,
            placeholder: '${placeholder}',
            spellChecker: false,
            minHeight: height + 'px',
            toolbar: toolbarButtons,
            status: ['lines', 'words', 'cursor'],
            renderingConfig: {
              singleLineBreaks: false,
              codeSyntaxHighlighting: true
            },
            initialValue: initialValue  // Set initial value during construction
          });

          // CRITICAL: Hide the original textarea to prevent focus issues
          textarea.style.display = 'none';
          
          // If initialValue wasn't set during construction, set it now
          if (initialValue && easyMDE.value() !== initialValue) {
            easyMDE.value(initialValue);
            console.log('📝 [MDX] Set initial value after construction');
          }
          
          // Sync content to textarea on change (similar to Quill implementation)
          easyMDE.codemirror.on('change', function() {
            const markdown = easyMDE.value();
            textarea.value = markdown;
            
            // Trigger change event for form validation
            const event = new Event('change', { bubbles: true });
            textarea.dispatchEvent(event);
          });

          // Store reference to editor instance
          textarea.easyMDEInstance = easyMDE;
          console.log('✅ [MDX DEBUG] Stored instance reference on textarea');
          
          // Ensure CodeMirror is properly focused and editable
          easyMDE.codemirror.setOption('readOnly', false);
          console.log('✅ [MDX DEBUG] Set CodeMirror readOnly to false');
          
          // Check what value is actually in the editor now
          const editorValue = easyMDE.value();
          console.log('🔍 [MDX DEBUG] Editor value after init, length:', editorValue.length);
          console.log('🔍 [MDX DEBUG] Editor value first 200 chars:', editorValue.substring(0, 200));
          
          // Force refresh to ensure proper rendering
          setTimeout(() => {
            easyMDE.codemirror.refresh();
            console.log('✅ [MDX DEBUG] CodeMirror refreshed');
            
            // Final check
            const finalValue = easyMDE.value();
            console.log('🔍 [MDX DEBUG] Final value after refresh, length:', finalValue.length);
            console.log('🔍 [MDX DEBUG] CodeMirror options:', {
              readOnly: easyMDE.codemirror.getOption('readOnly'),
              mode: easyMDE.codemirror.getOption('mode'),
              lineNumbers: easyMDE.codemirror.getOption('lineNumbers')
            });
          }, 100);

          console.log('✅ [MDX DEBUG] EasyMDE successfully initialized for:', textarea.id || textarea.name);
          console.log('✅ [MDX DEBUG] ========== Initialization complete ==========');
        } catch (error) {
          console.error('❌ [MDX DEBUG] Error initializing EasyMDE:', error);
          console.error('❌ [MDX DEBUG] Error stack:', error.stack);
          // Show textarea as fallback
          textarea.style.display = 'block';
          console.log('⚠️ [MDX DEBUG] Fallback: showing textarea as block');
        }
      });
      
      console.log('🔍 [MDX DEBUG] ========== initializeMDXEditor finished ==========');
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeMDXEditor);
    } else {
      // DOM already loaded, initialize immediately
      initializeMDXEditor();
    }

    // Also reinitialize after HTMX swaps (for dynamic content)
    document.addEventListener('htmx:afterSwap', function(event) {
      // Give the DOM a moment to settle
      setTimeout(initializeMDXEditor, 100);
    });
  `
}

/**
 * Check if EasyMDE editor plugin is active
 * @param pluginService - Plugin service instance
 * @returns Promise<boolean>
 */
export async function isEasyMdxActive(pluginService: any): Promise<boolean> {
  try {
    const status = await pluginService.getPluginStatus('easy-mdx')
    return status?.is_active === true
  } catch (error) {
    console.error('Error checking EasyMDE editor plugin status:', error)
    return false
  }
}
