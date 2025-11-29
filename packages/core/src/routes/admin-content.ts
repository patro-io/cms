import { Effect } from "effect";
import { Hono } from "hono";
import { html } from "hono/html";
import type { Bindings, Variables } from "../app";
import { requireAuth } from "../middleware";
import { i18nMiddleware, getTranslate } from "../middleware";
import { isPluginActive } from "../middleware/plugin-middleware";
import { getAvailableLocales, getLocaleDisplayName } from "../services/i18n";
import {
  CACHE_CONFIGS,
  CacheService,
  makeCacheServiceLayer,
} from "../services/cache";
import {
  ContentService,
  ContentNotFoundError,
  ContentAlreadyExistsError,
  TranslationAlreadyExistsError,
  type AvailableTranslationsResponse
} from "../services/content-effect";
import {
  CollectionService,
  CollectionNotFoundError,
  type CollectionField,
  type Collection
} from "../services/collection-effect";
import { UserService, type User } from "../services/user-effect";
import { DatabaseService, makeDatabaseLayer, ValidationError } from "../services/database-effect";
import { PluginService, makePluginServiceLayer } from "../services/plugin-service";
import { SettingsService } from "../services/settings";
import { makeAppLayer } from "../services";
import {
  processContentTranslation,
  mergeSettings,
  type AiTranslatorSettings
} from "../plugins/core-plugins/ai-translator-plugin";
import {
  ContentVersion,
  renderVersionHistory,
  VersionHistoryData,
} from "../templates/components/version-history.template";
import {
  ContentFormData,
  renderContentFormPage,
} from "../templates/pages/admin-content-form.template";
import {
  ContentListPageData,
  renderContentListPage,
} from "../templates/pages/admin-content-list.template";

const adminContentRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

// Get collection fields (Pure Effect)
const getCollectionFields = (collectionId: string) =>
  Effect.gen(function* (_) {
    const collectionService = yield* CollectionService;
    const cache = yield* CacheService;
    const key = yield* cache.generateKey("fields", collectionId);

    return yield* 
      cache.getOrSet(
        key,
        () =>
          Effect.gen(function* (_) {
            // First, check if collection has a schema (code-based collection)
            const collection = yield* 
               collectionService.getCollectionById(collectionId).pipe(
                  Effect.catchTag("CollectionNotFoundError", () => Effect.succeed(null))
               )
            ;

            if (collection && collection.schema) {
              try {
                const schema =
                  typeof collection.schema === "string"
                    ? JSON.parse(collection.schema)
                    : collection.schema;
                if (schema && schema.properties) {
                  // System fields that should be excluded from generated fields
                  // These are handled separately in the UI
                  const excludedFields = ['status', 'author', 'author_id'];
                  
                  // Convert schema properties to field format
                  let fieldOrder = 0;
                  return Object.entries(schema.properties)
                    .filter(([fieldName]) => !excludedFields.includes(fieldName))
                    .map(
                      ([fieldName, fieldConfig]: [string, any]): CollectionField => {
                        // For select fields, convert enum/enumLabels to options array
                        let fieldOptions = { ...fieldConfig };
                        if (fieldConfig.type === "select" && fieldConfig.enum) {
                          fieldOptions.options = fieldConfig.enum.map(
                            (value: string, index: number) => ({
                              value: value,
                              label: fieldConfig.enumLabels?.[index] || value,
                            })
                          );
                        }

                        return {
                          id: `schema-${fieldName}`,
                          collection_id: collectionId,
                          field_name: fieldName,
                          field_type: fieldConfig.type || "string",
                          field_label: fieldConfig.title || fieldName,
                          field_options: fieldOptions,
                          field_order: fieldOrder++,
                          is_required:
                            fieldConfig.required === true ||
                            (schema.required &&
                              schema.required.includes(fieldName)) ? 1 : 0,
                          is_searchable: 0,
                          created_at: Date.now(),
                          updated_at: Date.now()
                        };
                      }
                    );
                }
              } catch (e) {
                console.error("Error parsing collection schema:", e);
              }
            }

            // Fall back to content_fields table for legacy collections
            return yield* collectionService.getCollectionFields(collectionId);
          }),
        undefined
      )
  });

// Get collection by ID (Pure Effect)
const getCollection = (collectionId: string) =>
  Effect.gen(function* (_) {
    const collectionService = yield* CollectionService;
    const cache = yield* CacheService;
    const key = yield* cache.generateKey("collection", collectionId);

    return yield* 
      cache.getOrSet(
        key,
        () =>
          collectionService.getCollectionById(collectionId).pipe(
             Effect.catchTag("CollectionNotFoundError", () => Effect.succeed(null))
          ),
        undefined
      )
    ;
  });

// Content list (main page) - Pure Effect
adminContentRoutes.get("/", (c) => {
  const user = c.get("user");
  const url = new URL(c.req.url);
  const db = c.env.DB;

  // Get query parameters
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const modelName = url.searchParams.get("model") || "all";
  const status = url.searchParams.get("status") || "all";
  const language = url.searchParams.get("language") || "all";
  const search = url.searchParams.get("search") || "";
  const offset = (page - 1) * limit;

  const program = Effect.gen(function* (_) {
    const collectionService = yield* CollectionService;
    const contentService = yield* ContentService;
    const settingsService = yield* SettingsService;

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings();

    // Get all collections for filter dropdown
    const collections = yield* collectionService.getCollections();
    const models = collections.map((col) => ({
      name: col.name,
      displayName: col.display_name,
    }));

    // Build query options
    const queryOptions: any = {
      limit,
      offset,
      orderBy: "updated_at",
      orderDirection: "DESC" as const,
    };

    // Filter by collection if specified
    if (modelName !== "all") {
      const collection = yield* 
        collectionService.getCollectionByName(modelName).pipe(
            Effect.catchTag("CollectionNotFoundError", () => Effect.succeed(null))
        )
      ;
      if (collection) {
          queryOptions.collection_id = collection.id;
      }
    }

    // Filter by status
    if (status !== "all") {
      queryOptions.status = status;
    }

    // Filter by language
    if (language !== "all") {
      queryOptions.language = language;
    }

    // Add search
    if (search) {
      queryOptions.search = search;
    }

    // Get content and count
    const [contentItems, totalItems] = yield* 
      Effect.all([
        contentService.queryContent(queryOptions),
        contentService.countContent(queryOptions),
      ])
    ;

    // Enrich content items with translation info
    const enrichedItems = yield* Effect.all(
        contentItems.map((item) =>
          Effect.gen(function* (_) {
            if (!item.translation_group_id) {
              return { ...item, availableLanguages: [item.language || 'en'] };
            }
            
            // Get all translations in the group
            const groupContents = yield* contentService.getTranslationGroup(item.translation_group_id).pipe(
                Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
                Effect.catchAll(() => Effect.succeed([]))
              )
            
            const availableLanguages = groupContents
              .map(c => c.language || 'en')
              .filter((lang, idx, arr) => arr.indexOf(lang) === idx)
              .sort();
            
            return { ...item, availableLanguages };
          })
        )
      )
    return {
      type: 'success' as const,
      models,
      collections,
      contentItems: enrichedItems,
      totalItems,
      logoUrl: appearanceSettings.logoUrl
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          models: [],
          collections: [],
          contentItems: [],
          totalItems: 0,
          error: String(error)
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      console.error("Error fetching content list:", result.error);
      return c.html(`<p>Error loading content: ${result.error}</p>`);
    }

    // Create a map of collection IDs to display names for quick lookup
    const collectionMap = new Map(
      result.collections.map((c) => [c.id, c.display_name || c.name])
    );

    // Process content items for display
    const processedItems = result.contentItems.map((row: any) => {
      const statusConfig: Record<string, { class: string; text: string }> = {
        draft: {
          class:
            "bg-zinc-50 dark:bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 ring-1 ring-inset ring-zinc-600/20 dark:ring-zinc-500/20",
          text: "Draft",
        },
        review: {
          class:
            "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/20",
          text: "Under Review",
        },
        scheduled: {
          class:
            "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-500/20",
          text: "Scheduled",
        },
        published: {
          class:
            "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/20",
          text: "Published",
        },
        archived: {
          class:
            "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/20 dark:ring-purple-500/20",
          text: "Archived",
        },
        deleted: {
          class:
            "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/20",
          text: "Deleted",
        },
      };

      const config =
        statusConfig[row.status as keyof typeof statusConfig] ||
        statusConfig.draft;
      const statusBadge = `
        <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
          config?.class || ""
        }">
          ${config?.text || row.status}
        </span>
      `;

      const authorName = row.author_name || row.author_email || "Unknown";
      const formattedDate = new Date(row.updated_at).toLocaleDateString();

      // Determine available workflow actions based on status
      const availableActions: string[] = [];
      switch (row.status) {
        case "draft":
          availableActions.push("submit_for_review", "publish");
          break;
        case "review":
          availableActions.push("approve", "request_changes");
          break;
        case "published":
          availableActions.push("unpublish", "archive");
          break;
        case "scheduled":
          availableActions.push("unschedule");
          break;
      }

      return {
        id: row.id,
        title: row.title || row.slug,
        slug: row.slug,
        language: row.language || "en",
        availableLanguages: row.availableLanguages || [row.language || "en"],
        translationGroupId: row.translation_group_id,
        modelName: collectionMap.get(row.collection_id) || modelName,
        status: row.status,  // Include raw status for conditional rendering
        statusBadge,
        authorName,
        formattedDate,
        availableActions,
      };
    });

    const availableLanguages = getAvailableLocales().map((code) => ({
      code,
      label: getLocaleDisplayName(code),
    }));

    const pageData: ContentListPageData = {
      modelName,
      status,
      language,
      page,
      search,
      models: result.models,
      contentItems: processedItems,
      totalItems: result.totalItems,
      itemsPerPage: limit,
      user: user
        ? {
            name: user.email,
            email: user.email,
            role: user.role,
          }
        : undefined,
      version: c.get("appVersion"),
      logoUrl: result.logoUrl,
      availableLanguages,
    };

    const t = getTranslate(c);
    return c.html(renderContentListPage(pageData, t));
  });
});

// New content form - Pure Effect
adminContentRoutes.get("/new", (c) => {
  const user = c.get("user");
  const url = new URL(c.req.url);
  const collectionId = url.searchParams.get("collection");
  const db = c.env.DB;

  if (!collectionId) {
    const t = getTranslate(c);
    const program = Effect.gen(function* (_) {
      const collectionService = yield* CollectionService;
      return yield* collectionService.getCollections();
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(makeAppLayer(db))
      )
    ).then(collections => {
      // Render collection selection page
      const selectionHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${t('content.create')} - PatroCMS Admin</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-900 text-white">
          <div class="min-h-screen flex items-center justify-center">
            <div class="max-w-2xl w-full mx-auto p-8">
              <h1 class="text-3xl font-bold mb-8 text-center">${t('content.form.createNewContent')}</h1>
              <p class="text-gray-300 text-center mb-8">${t('content.form.selectCollection')}</p>
              
              <div class="grid gap-4">
                ${collections
                  .map(
                    (collection) => `
                  <a href="/admin/content/new?collection=${collection.id}"
                     class="block p-6 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700">
                    <h3 class="text-xl font-semibold mb-2">${
                      collection.display_name
                    }</h3>
                    <p class="text-gray-400">${
                      collection.description || t('collections.messages.noDescription') || "No description"
                    }</p>
                  </a>
                `
                  )
                  .join("")}
              </div>
              
              <div class="mt-8 text-center">
                <a href="/admin/content" class="text-blue-400 hover:text-blue-300">← ${t('content.backToContent')}</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      return c.html(selectionHTML);
    });
  }

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService;
    const settingsService = yield* SettingsService;

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings();

    const [collection, fields, users] = yield* 
      Effect.all([
        getCollection(collectionId),
        getCollectionFields(collectionId),
        userService.queryUsers({ is_active: true, limit: 100 })
      ])
    ;

    if (!collection) {
      return null;
    }

    // Check plugins in parallel - including AI Translator for default language
    const [workflowEnabled, quillEnabled, mdxeditorEnabled] = yield*
      Effect.all([
        Effect.tryPromise({
          try: () => isPluginActive(db, "workflow"),
          catch: (error) => new ValidationError(`Failed to check workflow plugin: ${error}`)
        }),
        Effect.tryPromise({
          try: () => isPluginActive(db, "quill-editor"),
          catch: (error) => new ValidationError(`Failed to check quill-editor plugin: ${error}`)
        }),
        Effect.tryPromise({
          try: () => isPluginActive(db, "easy-mdx"),
          catch: (error) => new ValidationError(`Failed to check easy-mdx plugin: ${error}`)
        })
      ])
    ;

    let quillSettings;
    if (quillEnabled) {
      const pluginService = yield* PluginService;
      const quillPlugin = yield* 
        pluginService.getPlugin("quill-editor").pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      ;
      quillSettings = quillPlugin?.settings;
    }

    let mdxeditorSettings;
    if (mdxeditorEnabled) {
      const pluginService = yield* PluginService;
      const mdxeditorPlugin = yield* 
        pluginService.getPlugin("easy-mdx").pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      ;
      mdxeditorSettings = mdxeditorPlugin?.settings;
    }

    // IMPORTANT: Get default language from AI Translator plugin settings
    // This is where the default language for new content is determined
    let defaultLanguage = 'en'; // Fallback if plugin not available
    const pluginService = yield* PluginService;
    const aiTranslatorPlugin = yield* 
      pluginService.getPlugin("ai-translator").pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    ;
    
    if (aiTranslatorPlugin?.settings) {
      const aiSettings = aiTranslatorPlugin.settings as AiTranslatorSettings;
      // Use defaultSourceLanguage from AI Translator plugin
      defaultLanguage = aiSettings.defaultSourceLanguage || 'en';
    }

    // Transform author field to select dropdown
    const transformedFields = fields.map((field) => {
      if (field.field_name === "author" || field.field_name === "author_id") {
        // Set default value to current user if available
        const fieldWithDefault = { ...field };
        if (user && user.userId && !fieldWithDefault.field_options.default) {
          fieldWithDefault.field_options = {
             ...fieldWithDefault.field_options,
             default: user.userId
          };
        }

        return {
          ...fieldWithDefault,
          field_type: "select",
          field_options: {
            ...fieldWithDefault.field_options,
            options: users.map((u: User) => ({
              value: u.id,
              label:
                u.first_name && u.last_name
                  ? `${u.first_name} ${u.last_name} (${u.email})`
                  : u.username || u.email,
            })),
          },
        };
      }
      return field;
    });

    return {
      collection,
      fields: transformedFields,
      workflowEnabled,
      quillEnabled,
      quillSettings,
      mdxeditorEnabled,
      mdxeditorSettings,
      logoUrl: appearanceSettings.logoUrl,
      defaultLanguage  // Pass the default language from AI Translator plugin to the form
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makePluginServiceLayer(db)),
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.collection!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        console.error("Error loading new content form:", error);
        return Effect.succeed(null);
      })
    )
  ).then(data => {
    if (!data) {
      const formData: ContentFormData = {
        collection: { id: "", name: "", display_name: "Unknown", schema: {} },
        fields: [],
        error: "Failed to load content form or collection not found.",
        user: user
          ? {
              name: user.email,
              email: user.email,
              role: user.role,
            }
          : undefined,
      };
      const t = getTranslate(c);
      return c.html(renderContentFormPage(formData, t));
    }

    const availableLanguages = getAvailableLocales().map((code) => ({
      code,
      label: getLocaleDisplayName(code),
    }));

    const formData: ContentFormData = {
      collection: {
        ...data.collection,
        schema: data.collection.schema || {}
      },
      fields: data.fields.map(f => ({
        ...f,
        is_required: Boolean(f.is_required),
        is_searchable: Boolean(f.is_searchable)
      })),
      isEdit: false,
      workflowEnabled: data.workflowEnabled,
      quillEnabled: data.quillEnabled,
      quillSettings: data.quillSettings,
      mdxeditorEnabled: data.mdxeditorEnabled,
      mdxeditorSettings: data.mdxeditorSettings,
      user: user
        ? {
            name: user.email,
            email: user.email,
            role: user.role,
          }
        : undefined,
      logoUrl: data.logoUrl,
      // IMPORTANT: Use default language from AI Translator plugin settings
      // This ensures new content starts with the correct source language
      language: data.defaultLanguage || 'en',
      availableLanguages,
    };

    const t = getTranslate(c);
    return c.html(renderContentFormPage(formData, t));
  });
});

// Edit content form - Pure Effect
adminContentRoutes.get("/:id/edit", (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const referrerParams = url.searchParams.get("ref") || "";

  const program = Effect.gen(function* (_) {
    const contentService = yield* ContentService;
    const userService = yield* UserService;
    const settingsService = yield* SettingsService;

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings();

    const content = yield* 
       contentService.getContentWithCollection(id).pipe(
           Effect.catchTag("ContentNotFoundError", () => Effect.succeed(null))
       )
    ;

    if (!content) {
      return null;
    }

    const collection = {
      id: content.collection_id,
      name: content.collection_name,
      display_name: content.collection_name,
      description: "",
      schema: content.collection_fields || {},
      is_active: 1,
      created_at: 0,
      updated_at: 0
    };

    const [fields, users] = yield* 
      Effect.all([
        getCollectionFields(content.collection_id),
        userService.queryUsers({ is_active: true, limit: 100 })
      ])
    ;

    // DEBUG: Log fields and content data
    console.log('🔍 [EDIT DEBUG] Collection:', content.collection_id);
    console.log('🔍 [EDIT DEBUG] Fields from getCollectionFields:', JSON.stringify(fields.map(f => ({
      name: f.field_name,
      type: f.field_type,
      label: f.field_label
    })), null, 2));
    console.log('🔍 [EDIT DEBUG] Content data:', JSON.stringify(content.data, null, 2));
    console.log('🔍 [EDIT DEBUG] Content language:', content.language);

    // Check plugins in parallel
    const [workflowEnabled, quillEnabled, mdxeditorEnabled] = yield*
      Effect.all([
        Effect.tryPromise({
          try: () => isPluginActive(db, "workflow"),
          catch: (error) => new ValidationError(`Failed to check workflow plugin: ${error}`)
        }),
        Effect.tryPromise({
          try: () => isPluginActive(db, "quill-editor"),
          catch: (error) => new ValidationError(`Failed to check quill-editor plugin: ${error}`)
        }),
        Effect.tryPromise({
          try: () => isPluginActive(db, "easy-mdx"),
          catch: (error) => new ValidationError(`Failed to check easy-mdx plugin: ${error}`)
        })
      ])
    ;

    let quillSettings;
    if (quillEnabled) {
      const pluginService = yield* PluginService;
      const quillPlugin = yield* 
        pluginService.getPlugin("quill-editor").pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      ;
      quillSettings = quillPlugin?.settings;
    }

    let mdxeditorSettings;
    if (mdxeditorEnabled) {
      const pluginService = yield* PluginService;
      const mdxeditorPlugin = yield* 
        pluginService.getPlugin("easy-mdx").pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      ;
      mdxeditorSettings = mdxeditorPlugin?.settings;
    }

    // IMPORTANT: Get default language from AI Translator plugin settings
    // This is where the default language for edit form is determined
    let defaultLanguage = 'en'; // Fallback if plugin not available
    const pluginService = yield* PluginService;
    const aiTranslatorPlugin = yield* 
      pluginService.getPlugin("ai-translator").pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    ;
    
    if (aiTranslatorPlugin?.settings) {
      const aiSettings = aiTranslatorPlugin.settings as AiTranslatorSettings;
      // Use defaultSourceLanguage from AI Translator plugin
      defaultLanguage = aiSettings.defaultSourceLanguage || 'en';
    }

    // Transform author field to select dropdown
    const transformedFields = fields.map((field) => {
      if (field.field_name === "author" || field.field_name === "author_id") {
        return {
          ...field,
          field_type: "select",
          field_options: {
            ...field.field_options,
            options: users.map((u: User) => ({
              value: u.id,
              label:
                u.first_name && u.last_name
                  ? `${u.first_name} ${u.last_name} (${u.email})`
                  : u.username || u.email,
            })),
          },
        };
      }
      return field;
    });

    return {
      content,
      collection,
      fields: transformedFields,
      workflowEnabled,
      quillEnabled,
      quillSettings,
      mdxeditorEnabled,
      mdxeditorSettings,
      logoUrl: appearanceSettings.logoUrl,
      defaultLanguage  // Pass the default language from AI Translator plugin to the form
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makePluginServiceLayer(db)),
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.collection!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        console.error("Error loading edit content form:", error);
        return Effect.succeed(null);
      })
    )
  ).then(data => {
    if (!data) {
      const formData: ContentFormData = {
        collection: { id: "", name: "", display_name: "Unknown", schema: {} },
        fields: [],
        error: "Content not found or failed to load.",
        user: user
          ? {
              name: user.email,
              email: user.email,
              role: user.role,
            }
          : undefined,
      };
      const t = getTranslate(c);
      return c.html(renderContentFormPage(formData, t));
    }

    const contentData = data.content.data || {};

    const availableLanguages = getAvailableLocales().map((code) => ({
      code,
      label: getLocaleDisplayName(code),
    }));

    const formData: ContentFormData = {
      id: data.content.id,
      title: data.content.title,
      slug: data.content.slug,
      data: contentData,
      status: data.content.status,
      scheduled_publish_at: data.content.scheduled_publish_at,
      scheduled_unpublish_at: data.content.scheduled_unpublish_at,
      review_status: data.content.review_status,
      meta_title: data.content.meta_title,
      meta_description: data.content.meta_description,
      created_at: data.content.created_at,
      updated_at: data.content.updated_at,
      published_at: data.content.published_at,
      author_id: data.content.author_id,
      language: data.content.language,
      defaultLanguage: data.defaultLanguage,
      translationGroupId: data.content.translation_group_id,
      availableLanguages,
      collection: {
        ...data.collection,
        schema: data.collection.schema || {}
      },
      fields: data.fields.map(f => ({
        ...f,
        is_required: Boolean(f.is_required),
        is_searchable: Boolean(f.is_searchable)
      })),
      isEdit: true,
      workflowEnabled: data.workflowEnabled,
      quillEnabled: data.quillEnabled,
      quillSettings: data.quillSettings,
      mdxeditorEnabled: data.mdxeditorEnabled,
      mdxeditorSettings: data.mdxeditorSettings,
      referrerParams,
      user: user
        ? {
            name: user.email,
            email: user.email,
            role: user.role,
          }
        : undefined,
      version: c.get("appVersion"),
      logoUrl: data.logoUrl
    };

    const t = getTranslate(c);
    return c.html(renderContentFormPage(formData, t));
  });
});

// Create content - Pure Effect
adminContentRoutes.post("/", (c) => {
  const user = c.get("user");
  const db = c.env.DB;

  // Validate user is authenticated
  if (!user || !user.userId) {
    return Promise.resolve(c.html(html`
      <div
        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
      >
        User authentication required. Please log in again.
      </div>
    `));
  }

  const program = Effect.gen(function* (_) {
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new ValidationError(`Failed to parse form data: ${error}`)
    });
    const collectionId = formData.get("collection_id") as string;
    const action = formData.get("action") as string;

    if (!collectionId) {
      return { type: 'error' as const, message: 'Collection ID is required.' };
    }

    const collection = yield* getCollection(collectionId);

    if (!collection) {
      return { type: 'error' as const, message: 'Collection not found.' };
    }

    const fields = yield* getCollectionFields(collectionId);

    // Extract field data
    const data: any = {};
    const errors: Record<string, string[]> = {};

    for (const field of fields) {
      const value = formData.get(field.field_name);

      // Validation
      if (field.is_required && (!value || value.toString().trim() === "")) {
        errors[field.field_name] = [`${field.field_label} is required`];
        continue;
      }

      // Type conversion and validation
      switch (field.field_type) {
        case "number":
          if (value && isNaN(Number(value))) {
            errors[field.field_name] = [
              `${field.field_label} must be a valid number`,
            ];
          } else {
            data[field.field_name] = value ? Number(value) : null;
          }
          break;
        case "boolean":
          data[field.field_name] = formData.get(`${field.field_name}_submitted`)
            ? value === "true"
            : false;
          break;
        case "select":
          if (field.field_options?.multiple) {
            data[field.field_name] = formData.getAll(`${field.field_name}[]`);
          } else {
            data[field.field_name] = value;
          }
          break;
        default:
          data[field.field_name] = value;
      }
    }

    // Check for validation errors
    if (Object.keys(errors).length > 0) {
      return {
          type: 'validation_error' as const,
          collection,
          fields,
          data,
          validationErrors: errors
      };
    }

    // Generate slug if not provided
    let slug = data.slug || data.title;
    if (slug) {
      slug = slug
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim("-");
    }

    // Determine status
    let status = (formData.get("status") as string) || "draft";
    if (action === "save_and_publish") {
      status = "published";
    }

    // Language (localization)
    const language = (formData.get("language") as string) || "en";

    // Handle scheduling
    const scheduledPublishAt = formData.get("scheduled_publish_at") as string;
    const scheduledUnpublishAt = formData.get(
      "scheduled_unpublish_at"
    ) as string;

    const contentService = yield* ContentService;

    // Create content
    const content = yield* 
      contentService.createContent({
        collection_id: collectionId,
        slug: slug || "untitled",
        data,
        status,
        // Use selected author from form data if available (author or author_id field), otherwise current user
        author_id: (data.author || data.author_id) ? String(data.author || data.author_id) : user.userId,
        title: data.title || "Untitled",
        scheduled_publish_at: scheduledPublishAt
          ? new Date(scheduledPublishAt).getTime()
          : undefined,
        scheduled_unpublish_at: scheduledUnpublishAt
          ? new Date(scheduledUnpublishAt).getTime()
          : undefined,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        language,
      })
    ;

    // Create initial version
    yield* 
      contentService.createContentVersion(content.id, data, user.userId)
    ;

    // Log workflow action
    yield* 
      contentService.logWorkflowAction(
        content.id,
        "created",
        "none",
        status,
        user.userId
      )
    ;

    // Invalidate collection content list cache
    const cache = yield* CacheService;
    yield* cache.invalidate(`content:list:${collectionId}:*`);

    return {
        type: 'success' as const,
        content,
        action,
        referrerParams: formData.get("referrer_params") as string
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.content!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        // Enhanced error logging to capture nested Error objects in cause
        const errorDetails: any = { ...(error as any) };
        if (errorDetails.cause instanceof Error) {
            errorDetails.cause = {
                message: errorDetails.cause.message,
                name: errorDetails.cause.name,
                stack: errorDetails.cause.stack
            };
        }
        console.error("Error creating content:", JSON.stringify(errorDetails, null, 2));
        
        let errorMessage = 'Failed to create content. Please try again.';
        // Handle specific error types if possible, or use generic message
        if ((error as any)._tag === 'ContentAlreadyExistsError') {
            errorMessage = `Content with this slug already exists.`;
        } else if ((error as any).message) {
             errorMessage = `Failed to create content: ${(error as any).message}`;
        } else {
             errorMessage = `Failed to create content: ${JSON.stringify(error)}`;
        }

        return Effect.succeed({
            type: 'error' as const,
            message: errorMessage,
            error
        });
      })
    )
  ).then(result => {
      if (result.type === 'error') {
         return c.html(html`
            <div
                class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
            >
                ${result.message}
            </div>
            `);
      }

      if (result.type === 'validation_error') {
        const formDataWithErrors: ContentFormData = {
            collection: {
              ...result.collection!,
              schema: result.collection!.schema || {}
            },
            fields: result.fields!.map(f => ({
              ...f,
              is_required: Boolean(f.is_required),
              is_searchable: Boolean(f.is_searchable)
            })),
            data: result.data,
            validationErrors: result.validationErrors,
            error: "Please fix the validation errors below.",
            user: user
              ? {
                  name: user.email,
                  email: user.email,
                  role: user.role,
                }
              : undefined,
        };
        const t = getTranslate(c);
        return c.html(renderContentFormPage(formDataWithErrors, t));
      }

      // Success
      const { content, action, referrerParams } = result;
      const redirectUrl =
        action === "save_and_continue"
            ? `/admin/content/${content!.id}/edit?success=Content saved successfully!${
                referrerParams ? `&ref=${encodeURIComponent(referrerParams)}` : ""
            }`
            : referrerParams
            ? `/admin/content?${referrerParams}&success=Content created successfully!`
            : `/admin/content?collection=${content!.collection_id}&success=Content created successfully!`;

      const isHTMX = c.req.header("HX-Request") === "true";
      if (isHTMX) {
          return c.text("", 200, {
              "HX-Redirect": redirectUrl,
          });
      } else {
          return c.redirect(redirectUrl);
      }
  });
});

// Update content - Pure Effect
adminContentRoutes.put("/:id", (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const db = c.env.DB;

  // Validate user is authenticated
  if (!user || !user.userId) {
    return Promise.resolve(c.html(html`
      <div
        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
      >
        User authentication required. Please log in again.
      </div>
    `));
  }

  const program = Effect.gen(function* (_) {
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new ValidationError(`Failed to parse form data: ${error}`)
    });
    const action = formData.get("action") as string;

    const contentService = yield* ContentService;
    const userService = yield* UserService;

    // Verify user exists in database and get their actual ID
    const dbUser = yield* userService.getUserById(user.userId).pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
            Effect.catchAll(() => Effect.succeed(null))
        )

    if (!dbUser) {
        return { type: 'error' as const, message: 'User not found in database. Please log in again.' };
    }

    // Get existing content
    const existingContent = yield* 
        contentService.getContentById(id).pipe(
            Effect.catchTag("ContentNotFoundError", () => Effect.succeed(null))
        )
    ;

    if (!existingContent) {
        return { type: 'error' as const, message: 'Content not found.' };
    }

    const collection = yield* getCollection(existingContent.collection_id);
    if (!collection) {
        return { type: 'error' as const, message: 'Collection not found.' };
    }

    const fields = yield* getCollectionFields(existingContent.collection_id);

    // Extract and validate field data
    const data: any = {};
    const errors: Record<string, string[]> = {};

    for (const field of fields) {
      const value = formData.get(field.field_name);

      if (field.is_required && (!value || value.toString().trim() === "")) {
        errors[field.field_name] = [`${field.field_label} is required`];
        continue;
      }

      switch (field.field_type) {
        case "number":
          if (value && isNaN(Number(value))) {
            errors[field.field_name] = [
              `${field.field_label} must be a valid number`,
            ];
          } else {
            data[field.field_name] = value ? Number(value) : null;
          }
          break;
        case "boolean":
          data[field.field_name] = formData.get(`${field.field_name}_submitted`)
            ? value === "true"
            : false;
          break;
        case "select":
          if (field.field_options?.multiple) {
            data[field.field_name] = formData.getAll(`${field.field_name}[]`);
          } else {
            data[field.field_name] = value;
          }
          break;
        default:
          data[field.field_name] = value;
      }
    }

    if (Object.keys(errors).length > 0) {
        return {
            type: 'validation_error' as const,
            collection,
            fields,
            data,
            validationErrors: errors,
            id: existingContent.id
        };
    }

    // Update slug if title changed
    let slug = data.slug || data.title;
    if (slug) {
      slug = slug
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim("-");
    }

    // Determine status
    let status = (formData.get("status") as string) || existingContent.status;
    if (action === "save_and_publish") {
      status = "published";
    }

    // Language (localization) - allow manual correction if needed
    const language =
      (formData.get("language") as string) ||
      existingContent.language ||
      "en";

    // Handle scheduling
    const scheduledPublishAt = formData.get("scheduled_publish_at") as string;
    const scheduledUnpublishAt = formData.get(
      "scheduled_unpublish_at"
    ) as string;

    // Update content - use dbUser.id instead of user.userId
    const updated = yield* 
      contentService.updateContent(id, {
        slug,
        data,
        status,
        updated_by: dbUser.id,
        title: data.title || "Untitled",
        scheduled_publish_at: scheduledPublishAt
          ? new Date(scheduledPublishAt).getTime()
          : undefined,
        scheduled_unpublish_at: scheduledUnpublishAt
          ? new Date(scheduledUnpublishAt).getTime()
          : undefined,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        language,
      })
    ;

    // Create new version if content changed - use dbUser.id
    const existingData = existingContent.data || {};
    if (JSON.stringify(existingData) !== JSON.stringify(data)) {
      yield* 
        contentService.createContentVersion(id, data, dbUser.id)
      ;
    }

    // Log workflow action if status changed - use dbUser.id
    if (status !== existingContent.status) {
      yield* 
        contentService.logWorkflowAction(
          id,
          "status_changed",
          existingContent.status,
          status,
          dbUser.id
        )
      ;
    }

    // Invalidate content cache
    const cache = yield* CacheService;
    const key = yield* cache.generateKey("content", id);
    yield* cache.delete(key);
    yield* cache.invalidate(`content:list:${existingContent.collection_id}:*`);

    return {
        type: 'success' as const,
        updated,
        existingContent,
        action,
        referrerParams: formData.get("referrer_params") as string
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.content!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        // Enhanced error logging to capture all error details
        console.error("Error updating content - Full error:", error);
        
        // Try to extract meaningful error information
        const errorObj = error as any;
        let errorMessage = 'Failed to update content. Please try again.';
        
        if (errorObj._tag === 'ContentAlreadyExistsError') {
            errorMessage = `Content with this slug already exists.`;
        } else if (errorObj._tag === 'DatabaseError') {
            // Check for FOREIGN KEY constraint errors
            if (errorObj.cause?.message?.includes('FOREIGN KEY constraint failed')) {
                errorMessage = `Database error: Invalid user reference. Please ensure the author exists in the system.`;
            } else if (errorObj.message) {
                errorMessage = `Database error: ${errorObj.message}`;
            } else if (errorObj.cause?.message) {
                console.error("Database error cause:", errorObj.cause);
                errorMessage = `Database error: ${errorObj.cause.message}`;
            }
        } else if (errorObj.message) {
            errorMessage = `Failed to update content: ${errorObj.message}`;
        }

        return Effect.succeed({
            type: 'error' as const,
            message: errorMessage
        });
      })
    )
  ).then(result => {
      if (result.type === 'error') {
          return c.html(html`
            <div
                class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
            >
                ${result.message}
            </div>
            `);
      }

      if (result.type === 'validation_error') {
        const formDataWithErrors: ContentFormData = {
            id: result.id,
            collection: {
              ...result.collection!,
              schema: result.collection!.schema || {}
            },
            fields: result.fields!.map(f => ({
              ...f,
              is_required: Boolean(f.is_required),
              is_searchable: Boolean(f.is_searchable)
            })),
            data: result.data,
            validationErrors: result.validationErrors,
            error: "Please fix the validation errors below.",
            isEdit: true,
            user: user
            ? {
                name: user.email,
                email: user.email,
                role: user.role,
                }
            : undefined,
        };
        const t = getTranslate(c);
        return c.html(renderContentFormPage(formDataWithErrors, t));
      }

      const { updated, existingContent, action, referrerParams } = result;
      const redirectUrl =
        action === "save_and_continue"
            ? `/admin/content/${id}/edit?success=Content updated successfully!${
                referrerParams ? `&ref=${encodeURIComponent(referrerParams)}` : ""
            }`
            : referrerParams
            ? `/admin/content?${referrerParams}&success=Content updated successfully!`
            : `/admin/content?collection=${existingContent!.collection_id}&success=Content updated successfully!`;

      const isHTMX = c.req.header("HX-Request") === "true";
      if (isHTMX) {
          return c.text("", 200, {
              "HX-Redirect": redirectUrl,
          });
      } else {
          return c.redirect(redirectUrl);
      }
  });
});

// Delete content - Pure Effect
adminContentRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const user = c.get("user");
  const url = new URL(c.req.url);
  const force = url.searchParams.get("force") === "true";

  if (!user || !user.userId) {
    return c.json({ success: false, error: "User authentication required" }, 401);
  }

  const program = Effect.gen(function* (_) {
    const contentService = yield* ContentService;
    
    // Get content to check status and know collection_id for cache invalidation
    const content = yield* contentService.getContentById(id);
    
    // Hard delete if:
    // 1. Force parameter is true, OR
    // 2. Content is already in 'deleted' status
    if (force || content.status === 'deleted') {
      // Permanently delete
      yield* contentService.hardDeleteContent(id);
    } else {
      // Soft delete (move to deleted status)
      yield* contentService.softDeleteContent(id, user.userId);
    }
    
    // Invalidate cache
    const cache = yield* CacheService;
    const key = yield* cache.generateKey("content", id);
    yield* cache.delete(key);
    yield* cache.invalidate("content:list:*");

    return { collectionId: content.collection_id, wasHardDeleted: force || content.status === 'deleted' };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.content!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
          console.error("Delete content error:", error);
          return Effect.fail(error);
      })
    )
  ).then(
    (result) => {
        const deleteMessage = result.wasHardDeleted
          ? "Content permanently deleted successfully!"
          : "Content moved to trash!";
        
        // Build redirect URL with current query params and success message
        const currentUrl = new URL(c.req.url);
        const redirectUrl = `/admin/content${currentUrl.search ? currentUrl.search + '&' : '?'}success=${encodeURIComponent(deleteMessage)}`;
        
        // Use HTMX redirect header to reload the page properly
        return c.text("", 200, {
            "HX-Redirect": redirectUrl
        });
    },
    (error) => {
        return c.json({ success: false, error: "Failed to delete content" }, 500);
    }
  );
});

// Content preview - Pure Effect
adminContentRoutes.post("/preview", (c) => {
  const db = c.env.DB;

  const program = Effect.gen(function* (_) {
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new ValidationError(`Failed to parse form data: ${error}`)
    });
    const collectionId = formData.get("collection_id") as string;

    const collection = yield* getCollection(collectionId);

    if (!collection) {
      return { type: 'error' as const, message: 'Collection not found' };
    }

    const fields = yield* getCollectionFields(collectionId);

    // Extract field data for preview
    const data: any = {};
    for (const field of fields) {
      const value = formData.get(field.field_name);

      switch (field.field_type) {
        case "number":
          data[field.field_name] = value ? Number(value) : null;
          break;
        case "boolean":
          data[field.field_name] = value === "true";
          break;
        case "select":
          if (field.field_options?.multiple) {
            data[field.field_name] = formData.getAll(`${field.field_name}[]`);
          } else {
            data[field.field_name] = value;
          }
          break;
        default:
          data[field.field_name] = value;
      }
    }

    return { type: 'success' as const, collection, data, fields, status: formData.get("status") || "draft" };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.collection!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
          console.error("Error generating preview:", error);
          return Effect.succeed({ type: 'error' as const, message: 'Error generating preview' });
      })
    )
  ).then(result => {
      if (result.type === 'error') {
          return c.html(`<p>${result.message}</p>`);
      }

      const { collection, data, fields, status } = result;

      const previewHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Preview: ${data.title || "Untitled"}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
          .content { line-height: 1.6; }
        </style>
      </head>
      <body>
        <h1>${data.title || "Untitled"}</h1>
        <div class="meta">
          <strong>Collection:</strong> ${collection!.display_name}<br>
          <strong>Status:</strong> ${status}<br>
          ${
            data.meta_description
              ? `<strong>Description:</strong> ${data.meta_description}<br>`
              : ""
          }
        </div>
        <div class="content">
          ${data.content || "<p>No content provided.</p>"}
        </div>
        
        <h3>All Fields:</h3>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <tr><th>Field</th><th>Value</th></tr>
          ${fields!
            .map(
              (field) => `
            <tr>
              <td><strong>${field.field_label}</strong></td>
              <td>${data[field.field_name] || "<em>empty</em>"}</td>
            </tr>
          `
            )
            .join("")}
        </table>
      </body>
      </html>
    `;

    return c.html(previewHTML);
  });
});

// Duplicate content - Pure Effect
adminContentRoutes.post("/duplicate", (c) => {
  const user = c.get("user");
  const db = c.env.DB;

  // Validate user is authenticated
  if (!user || !user.userId) {
    return c.json({ success: false, error: "User authentication required" });
  }

  const program = Effect.gen(function* (_) {
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new ValidationError(`Failed to parse form data: ${error}`)
    });
    const originalId = formData.get("id") as string;

    if (!originalId) {
      return yield* Effect.fail("Content ID required");
    }

    const contentService = yield* ContentService;
    
    // Duplicate content
    const duplicate = yield* 
      contentService.duplicateContent(originalId, user.userId)
    ;
    
    return duplicate;
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
          console.error("Error duplicating content:", error);
          return Effect.fail(error);
      })
    )
  ).then(
      (newContent) => c.json({ success: true, id: newContent.id }),
      () => c.json({ success: false, error: "Failed to duplicate content" })
  );
});

// Get bulk actions modal - Pure Effect (Simple template render, but wrapped for consistency)
adminContentRoutes.get("/bulk-actions", (c) => {
  const bulkActionsModal = `
    <div class="fixed inset-0 bg-zinc-950/50 dark:bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick="this.remove()">
      <div class="bg-white dark:bg-zinc-900 rounded-xl shadow-xl ring-1 ring-zinc-950/5 dark:ring-white/10 p-6 max-w-md w-full" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-zinc-950 dark:text-white">Bulk Actions</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Select items from the table below to perform bulk actions.
        </p>
        <div class="space-y-2">
          <button
            onclick="performBulkAction('publish')"
            class="w-full inline-flex items-center justify-center gap-x-2 px-4 py-2.5 bg-lime-600 dark:bg-lime-500 text-white rounded-lg hover:bg-lime-700 dark:hover:bg-lime-600 transition-colors"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            Publish Selected
          </button>
          <button
            onclick="performBulkAction('draft')"
            class="w-full inline-flex items-center justify-center gap-x-2 px-4 py-2.5 bg-zinc-600 dark:bg-zinc-700 text-white rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            Move to Draft
          </button>
          <button
            onclick="performBulkAction('delete')"
            class="w-full inline-flex items-center justify-center gap-x-2 px-4 py-2.5 bg-red-600 dark:bg-red-500 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete Selected
          </button>
        </div>
      </div>
    </div>
    <script>
      function performBulkAction(action) {
        const selectedIds = Array.from(document.querySelectorAll('input[type="checkbox"].row-checkbox:checked'))
          .map(cb => cb.value)
          .filter(id => id)

        if (selectedIds.length === 0) {
          alert('Please select at least one item')
          return
        }

        const actionText = action === 'publish' ? 'publish' : action === 'draft' ? 'move to draft' : 'delete'
        const confirmed = confirm(\`Are you sure you want to \${actionText} \${selectedIds.length} item(s)?\`)

        if (!confirmed) return

        fetch('/admin/content/bulk-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: action,
            ids: selectedIds
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            document.querySelector('#bulk-actions-modal .fixed').remove()
            location.reload()
          } else {
            alert('Error: ' + (data.error || 'Unknown error'))
          }
        })
        .catch(err => {
          console.error('Bulk action error:', err)
          alert('Failed to perform bulk action')
        })
      }
    </script>
  `;

  return c.html(bulkActionsModal);
});

// Perform bulk action - Pure Effect
adminContentRoutes.post("/bulk-action", (c) => {
  const user = c.get("user");
  const db = c.env.DB;

  if (!user || !user.userId) {
    return c.json({ success: false, error: "User authentication required" });
  }

  const program = Effect.gen(function* (_) {
    const body = yield* Effect.tryPromise({
      try: () => c.req.json(),
      catch: (error) => new ValidationError(`Failed to parse JSON body: ${error}`)
    });
    const { action, ids } = body;

    if (!action || !ids || ids.length === 0) {
      return yield* Effect.fail("Action and IDs required");
    }

    const contentService = yield* ContentService;

    if (action === "delete") {
      // Soft delete all items (move to trash)
      for (const id of ids) {
        yield* contentService.softDeleteContent(id, user.userId);
      }
    } else if (action === "hard_delete") {
      // Permanently delete all items
      for (const id of ids) {
        yield* contentService.hardDeleteContent(id);
      }
    } else if (action === "publish" || action === "draft") {
      // Update status for all items
      yield* 
        contentService.bulkUpdateStatus(ids, action, user.userId)
      ;
    } else {
      return yield* Effect.fail("Invalid action");
    }
    
    // Invalidate cache
    const cache = yield* CacheService;
    for (const contentId of ids) {
      const key = yield* cache.generateKey("content", contentId);
      yield* cache.delete(key);
    }
    yield* cache.invalidate("content:list:*");

    return ids.length;
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.content!)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
          console.error("Bulk action error:", error);
          return Effect.fail(error);
      })
    )
  ).then(
      (count) => c.json({ success: true, count }),
      (error) => c.json({ success: false, error: "Failed to perform bulk action" })
  );
});

// Get version history - Pure Effect
adminContentRoutes.get("/:id/versions", (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const program = Effect.gen(function* (_) {
    const contentService = yield* ContentService;
    
    // Get current content
    const content = yield* contentService.getContentById(id);
    
    // Get all versions
    const versions = yield* contentService.getContentVersions(id);
    
    return { content, versions };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        console.error("Error loading version history:", error);
        return Effect.succeed({ content: null, versions: [] });
      })
    )
  ).then(result => {
    if (!result.content) {
      return c.html("<p>Content not found</p>");
    }

    // Manual join for author info (for now, until UserService handles this nicely or we extend ContentService)
    // This is a compromise to keep the main logic pure effect but handle the display enrichment here
    // or ideally move this enrichment to a service. For now, I'll use a separate Effect for enrichment if needed, 
    // but sticking to the original logic style which used direct DB query for enrichment.
    // Actually, let's do the enrichment via pure effect using DatabaseService raw query if needed, or skip enrichment if not critical?
    // The original code had a raw query join. I will replicate that using DatabaseService.
    
    const dbLayer = makeDatabaseLayer(db);
    const enrichmentProgram = Effect.gen(function* (_) {
         const db = yield* DatabaseService;
         const results = yield* db.query<any>(`
            SELECT cv.*, u.first_name, u.last_name, u.email
            FROM content_versions cv
            LEFT JOIN users u ON cv.author_id = u.id
            WHERE cv.content_id = ?
            ORDER BY cv.version DESC
         `, [id]);
         return results;
    });

    return Effect.runPromise(
        enrichmentProgram.pipe(Effect.provide(dbLayer))
    ).then(results => {
        const versions: ContentVersion[] = (results || []).map((row: any) => ({
            id: row.id,
            version: row.version,
            data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
            author_id: row.author_id,
            author_name:
              row.first_name && row.last_name
                ? `${row.first_name} ${row.last_name}`
                : row.email,
            created_at: row.created_at,
            is_current: false,
        }));

        // Mark the latest version as current
        if (versions.length > 0) {
            versions[0]!.is_current = true;
        }

        const data: VersionHistoryData = {
            contentId: id,
            versions,
            currentVersion: versions.length > 0 ? versions[0]!.version : 1,
        };

        return c.html(renderVersionHistory(data));
    });
  });
});

// Restore version - Pure Effect
adminContentRoutes.post("/:id/restore/:version", (c) => {
  const id = c.req.param("id");
  const version = parseInt(c.req.param("version"));
  const user = c.get("user");
  const db = c.env.DB;

  if (!user || !user.userId) {
    return c.json({ success: false, error: "User authentication required" });
  }

  const program = Effect.gen(function* (_) {
    const contentService = yield* ContentService;
    
    // Get current content for workflow logging
    const currentContent = yield* contentService.getContentById(id);
    
    // Restore version
    const restored = yield* 
      contentService.restoreContentVersion(id, version, user.userId)
    ;
    
    // Log workflow action
    yield* 
      contentService.logWorkflowAction(
        id,
        "version_restored",
        currentContent.status,
        currentContent.status,
        user.userId,
        `Restored to version ${version}`
      )
    ;
    
    return restored;
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
          console.error("Error restoring version:", error);
          return Effect.fail(error);
      })
    )
  ).then(
      () => c.json({ success: true }),
      () => c.json({ success: false, error: "Failed to restore version" })
  );
});

// Preview specific version - Pure Effect
adminContentRoutes.get("/:id/version/:version/preview", (c) => {
  const id = c.req.param("id");
  const version = parseInt(c.req.param("version"));
  const db = c.env.DB;

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService;
    
    // Get the specific version with collection info
    const versionData = yield* dbService.queryFirst<any>(`
      SELECT cv.*, c.collection_id, col.display_name as collection_name
      FROM content_versions cv
      JOIN content c ON cv.content_id = c.id
      JOIN collections col ON c.collection_id = col.id
      WHERE cv.content_id = ? AND cv.version = ?
    `, [id, version]);
    
    return versionData;
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(db)),
      Effect.catchAll((error) => {
          console.error("Error generating version preview:", error);
          return Effect.succeed(null);
      })
    )
  ).then(versionData => {
      if (!versionData) {
          return c.html("<p>Version not found</p>");
      }

      const data = typeof versionData.data === 'string' ? JSON.parse(versionData.data) : versionData.data || {};

      const previewHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Version ${version} Preview: ${data.title || "Untitled"}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          .meta { color: #666; font-size: 14px; margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
          .content { line-height: 1.6; }
          .version-badge { background: #007cba; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="meta">
          <span class="version-badge">Version ${version}</span>
          <strong>Collection:</strong> ${versionData.collection_name}<br>
          <strong>Created:</strong> ${new Date(
            versionData.created_at
          ).toLocaleString()}<br>
          <em>This is a historical version preview</em>
        </div>
        
        <h1>${data.title || "Untitled"}</h1>
        
        <div class="content">
          ${data.content || "<p>No content provided.</p>"}
        </div>
        
        ${data.excerpt ? `<h3>Excerpt:</h3><p>${data.excerpt}</p>` : ""}
        
        <h3>All Field Data:</h3>
        <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(data, null, 2)}
        </pre>
      </body>
      </html>
    `;

    return c.html(previewHTML);
  });
});

// =====================================================
// TRANSLATION API ENDPOINTS
// =====================================================

// Get available translations for content - Pure Effect
adminContentRoutes.get("/:id/translations", (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;

  const program = Effect.gen(function* (_) {
    const contentService = yield* ContentService;
    
    // Get available translations using the new ContentService method
    const translationsData = yield* 
      contentService.getAvailableTranslations(id)
    ;
    
    return translationsData;
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchTag("ContentNotFoundError", () =>
        Effect.succeed({
          error: "Content not found",
          current: { language: "en", contentId: id },
          translations: [],
          availableTargetLanguages: []
        } as AvailableTranslationsResponse & { error?: string })
      ),
      Effect.catchAll((error) => {
        console.error("Error fetching translations:", error);
        return Effect.succeed({
          error: "Failed to fetch translations",
          current: { language: "en", contentId: id },
          translations: [],
          availableTargetLanguages: []
        } as AvailableTranslationsResponse & { error?: string });
      })
    )
  ).then(result => {
    if ('error' in result && result.error) {
      return c.json({ success: false, error: result.error }, 404);
    }
    return c.json({
      success: true,
      ...result
    });
  });
});

// Create a new translation for content - Pure Effect
adminContentRoutes.post("/:id/translate", (c) => {
  console.log('[AI Translator] Manual translation triggered for content:', c.req.param("id"));
  const id = c.req.param("id");
  const user = c.get("user");
  const db = c.env.DB;

  // Validate user is authenticated
  if (!user || !user.userId) {
    return Promise.resolve(c.json({
      success: false,
      error: "User authentication required"
    }, 401));
  }

  const program = Effect.gen(function* (_) {
    // Parse request body
    const body = yield* Effect.tryPromise({
      try: () => c.req.json(),
      catch: (error) => new ValidationError(`Failed to parse JSON body: ${error}`)
    });
    const { targetLanguage, useAi = false } = body;

    if (!targetLanguage) {
      return {
        type: 'error' as const,
        message: 'Target language is required',
        status: 400
      };
    }

    // Validate target language using centralized locale list
    const supportedLanguages = getAvailableLocales();
    if (!supportedLanguages.includes(targetLanguage as any)) {
      return {
        type: 'error' as const,
        message: `Unsupported language: ${targetLanguage}. Supported: ${supportedLanguages.join(', ')}`,
        status: 400
      };
    }

    const contentService = yield* ContentService;

    // Create the translation
    const newContent = yield* 
      contentService.createTranslation(id, targetLanguage, { useAi })
    ;

    // Log workflow action
    yield* 
      contentService.logWorkflowAction(
        newContent.id,
        "created",
        "none",
        "draft",
        user.userId,
        `Translation created from ${id} to ${targetLanguage}${useAi ? ' (AI)' : ''}`
      )
    ;

    // If useAi is true, trigger the AI translation directly
    if (useAi) {
       console.log('[AI Translator] Triggering AI processing for content:', id, 'target:', targetLanguage);
       
       const pluginService = yield* PluginService;
       const aiPlugin = yield* pluginService.getPlugin('ai-translator').pipe(
           Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
           Effect.catchAll(() => Effect.succeed(null))
         )
       
       if (!aiPlugin || aiPlugin.status !== 'active') {
         console.warn('[AI Translator] Plugin not active or not found');
       } else {
         // ✅ FIX: Use mergeSettings instead of manual spread to preserve defaults for empty arrays
         const settings: AiTranslatorSettings = aiPlugin.settings
           ? mergeSettings(aiPlugin.settings)
           : mergeSettings({});
         
         if (!settings.enabled) {
           console.warn('[AI Translator] Plugin is disabled in settings');
         } else {
           // Get database service and AI binding
           const dbService = yield* DatabaseService;
           // AI binding might not be in Bindings interface yet, cast to any
           const ai = (c.env as any).AI;
           
           if (!ai) {
             console.warn('[AI Translator] AI binding not found in environment, falling back to Mock service inside plugin logic');
           }

           // Process translation in background using direct function call
           // We pass 'ai' even if undefined - the plugin handles fallback to Mock service
           // CRITICAL: We must pass the SOURCE content ID ('id'), not the new translation ID ('newContent.id')
           // The function reads the source and generates/updates translations derived from it.
           const translationPromise = Effect.runPromise(
             processContentTranslation(dbService, ai, id, settings, targetLanguage)
           ).catch((err: unknown) => {
             console.error('[AI Translator] Translation failed:', err);
           });
           
           // Use waitUntil to keep worker alive
           const executionCtx = c.executionCtx;
           if (executionCtx && typeof executionCtx.waitUntil === 'function') {
             executionCtx.waitUntil(translationPromise);
           } else {
             console.warn('[AI Translator] No waitUntil found - translation might be interrupted');
           }
         }
       }
    }

    return {
      type: 'success' as const,
      contentId: newContent.id,
      language: targetLanguage,
      translationGroupId: newContent.translation_group_id
    };
  });

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makePluginServiceLayer(db)),
      Effect.provide(makeAppLayer(db)),
      Effect.catchTag("ContentNotFoundError", (error) =>
        Effect.succeed({
          type: 'error' as const,
          message: `Content not found: ${error.contentId}`,
          status: 404
        })
      ),
      Effect.catchTag("TranslationAlreadyExistsError", (error) =>
        Effect.succeed({
          type: 'error' as const,
          message: `Translation already exists for language: ${error.language}`,
          status: 409
        })
      ),
      Effect.catchTag("ValidationError", (error) =>
        Effect.succeed({
          type: 'error' as const,
          message: error.message,
          status: 400
        })
      ),
      Effect.catchAll((error) => {
        console.error("Error creating translation:", error);
        return Effect.succeed({
          type: 'error' as const,
          message: 'Failed to create translation',
          status: 500
        });
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({
        success: false,
        error: result.message
      }, result.status as any);
    }

    return c.json({
      success: true,
      contentId: result.contentId,
      language: result.language,
      translationGroupId: result.translationGroupId
    }, 201);
  });
});

export default adminContentRoutes;