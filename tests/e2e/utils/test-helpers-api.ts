import { APIRequestContext, Browser, Page, expect } from '@playwright/test';

// Default admin credentials
export const ADMIN_CREDENTIALS = {
  email: 'admin@patro.io',
  password: 'patro!'
};

/**
 * Get authenticated API context
 */
export async function getApiContext(playwright: any, request: APIRequestContext) {
  // Use existing request context if already authenticated, or create new one
  return request;
}

/**
 * Login and get auth token/cookie
 */
export async function login(apiContext: APIRequestContext) {
  // 1. Seed admin first
  await apiContext.post('/auth/seed-admin');

  // 2. Login
  const response = await apiContext.post('/auth/login', {
    form: {
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password
    }
  });

  expect(response.status()).toBe(200); // Or 302 if redirect
  
  // Return context with cookies (playwright request context manages cookies automatically)
  return apiContext;
}

/**
 * Reset database using the test cleanup endpoint
 */
export async function resetDatabase(apiContext?: APIRequestContext) {
  // This endpoint should be available in test environment
  // We'll use a fetch request if apiContext is not provided
  if (apiContext) {
    await apiContext.post('/test-cleanup');
  }
}

/**
 * Create content via API
 */
export async function createContent(apiContext: APIRequestContext, collectionName: string, data: any) {
  // 1. Ensure collection exists
  let collectionId: string = '';
  
  // Try to find collection by name
  const collectionsRes = await apiContext.get('/admin/api/collections');
  if (collectionsRes.ok()) {
    const collections = await collectionsRes.json();
    const collection = collections.find((c: any) => c.name === collectionName);
    if (collection) {
      collectionId = collection.id;
    }
  }

  // Create collection if not found
  if (!collectionId) {
    const createColRes = await apiContext.post('/admin/api/collections', {
      data: {
        name: collectionName,
        displayName: collectionName,
        description: 'Test Collection',
        type: 'content'
      }
    });
    
    if (createColRes.ok()) {
       const col = await createColRes.json();
       collectionId = col.id;
       
       // Add fields
       await apiContext.post(`/admin/api/collections/${collectionId}/fields`, {
          data: {
             name: 'title',
             label: 'Title',
             type: 'text',
             required: true
          }
       });
       await apiContext.post(`/admin/api/collections/${collectionId}/fields`, {
          data: {
             name: 'content',
             label: 'Content',
             type: 'rich-text',
             required: false
          }
       });
    } else {
        // Fallback for when we can't create collection via API easily or it already exists but list failed
        // For blog-posts it usually exists from seed
        // Let's assume ID if we know it or try to fetch again
    }
  }

  // If we still don't have collection ID, try to get it from list again (maybe seed worked)
  if (!collectionId) {
      const collectionsRes = await apiContext.get('/admin/api/collections');
      const collections = await collectionsRes.json();
      const collection = collections.find((c: any) => c.name === collectionName);
      if (collection) collectionId = collection.id;
  }

  if (!collectionId) {
      throw new Error(`Collection ${collectionName} not found and could not be created`);
  }

  // 2. Create content
  // Note: Content creation API might expect form data or JSON depending on implementation
  // Based on admin-content.ts, it uses FormData for POST /admin/content (UI)
  // or JSON for API? Let's check api-routes.ts for public API or admin-api-routes.ts
  // Assuming there is an admin API for content creation
  
  // Let's use the UI endpoint which we modified/inspected: /admin/content
  // It expects FormData
  
  // Or better, use the internal API if available. 
  // Let's try /admin/api/content (if it exists) or just use the one we know works from UI tests
  
  // Using FormData for /admin/content endpoint
  // But wait, the test is using apiContext which usually sends JSON.
  // Playwright request can send multipart/form-data.
  
  // However, the test we are fixing is about /admin/content/:id/translate which is in admin-content.ts
  // The create content is just setup.
  
  // Let's try to find an easier way to create content.
  // Maybe there is a seed endpoint or we can use the /admin/content endpoint.
  
  const formData: any = {
      collection_id: collectionId,
      title: data.title,
      slug: data.slug,
      status: 'draft',
      language: data.language || 'cs'
  };
  
  // Map data fields
  if (data.content) formData.content = data.content;
  if (data.excerpt) formData.excerpt = data.excerpt;
  
  // Create form data object
  const multipartData: any = {};
  for (const key in formData) {
      multipartData[key] = String(formData[key]);
  }
  
  const response = await apiContext.post('/admin/content', {
      multipart: multipartData
  });
  
  // The endpoint returns redirect or JSON if HTMX.
  // If we send HX-Request header it returns JSON/Text.
  // But if we just want the ID, we might need to parse it or use a different endpoint.
  
  // Let's use /admin/api/content if it exists (usually standard in headless CMS)
  // Checking app.ts -> app.route('/admin/api', adminApiRoutes)
  // We need to check admin-api-routes.ts to be sure.
  
  // If we can't rely on API, let's use the response from /admin/content.
  // If it redirects to /admin/content?collection=...&success=..., we don't get ID easily.
  // If it redirects to /admin/content/:id/edit, we can parse ID from URL.
  
  const url = response.url();
  // Expect URL to match /admin/content/([a-z0-9-]+)/edit
  const match = url.match(/\/admin\/content\/([a-z0-9-]+)\/edit/);
  
  if (match && match[1]) {
      return { id: match[1], ...data };
  }
  
  // If we failed to get ID, try to search for it by slug
  const listRes = await apiContext.get(`/admin/content?model=${collectionName}&search=${data.slug}`);
  // This returns HTML list.
  
  // Let's assume we can get it via direct query if we have a special test helper endpoint
  // OR just fail if we can't create.
  
  throw new Error('Could not create content or retrieve ID');
}

/**
 * Cleanup content
 */
export async function cleanupContent(apiContext: APIRequestContext, id: string) {
  if (!id) return;
  await apiContext.delete(`/admin/content/${id}`);
}