import { test, expect } from '@playwright/test';
import {
  login,
  createContent,
  cleanupContent,
  resetDatabase,
  getApiContext
} from './utils/test-helpers-api';

test.describe('AI Translation Manual Trigger', () => {
  let apiContext;
  let createdContentIds: string[] = [];

  test.beforeAll(async ({ playwright, request }) => {
    // Reset DB and Seed Admin
    await resetDatabase();
    apiContext = await getApiContext(playwright, request);
    await login(apiContext);
  });

  test.afterAll(async () => {
    // Cleanup created content
    for (const id of createdContentIds) {
      await cleanupContent(apiContext, id);
    }
  });

  test('Manual translation trigger endpoint should initiate translation', async ({ request }) => {
    // 1. Create a content item in Czech (default)
    const content = await createContent(apiContext, 'blog-posts', {
      title: 'Manuální Test Překladu',
      slug: 'manual-test-translation',
      content: 'Toto je text pro testování manuálního spuštění překladu.',
      language: 'cs'
    });
    createdContentIds.push(content.id);

    console.log(`Created content: ${content.id}`);

    // 2. Trigger translation to English via API with useAi=true
    const response = await apiContext.post(`/admin/content/${content.id}/translate`, {
      data: {
        targetLanguage: 'en',
        useAi: true
      }
    });

    // 3. Verify immediate response
    expect(response.status()).toBe(201);
    const result = await response.json();
    
    expect(result.success).toBe(true);
    expect(result.contentId).toBeDefined();
    expect(result.language).toBe('en');
    expect(result.translationGroupId).toBeDefined();
    createdContentIds.push(result.contentId);

    console.log(`Triggered translation. New content ID: ${result.contentId}`);

    // 4. Verify the new content exists and is in draft (initial state)
    const translationResponse = await apiContext.get(`/admin/api/content/${result.contentId}`);
    expect(translationResponse.status()).toBe(200);
    const translation = await translationResponse.json();
    
    expect(translation.language).toBe('en');
    expect(translation.status).toBe('draft');
    // Initially it might not be translated yet if worker hasn't finished, 
    // but the record should exist.
    
    // 5. Wait a bit for the background process (mocked or real) to potentially finish
    // Since we are running in e2e test environment which might not have full worker background processing 
    // persistence across requests depending on setup (e.g. cloudflare/vitest integration),
    // we primarily test that the trigger endpoint works and returns correct status.
    
    // Optional: Check if translation was actually processed (if mock service is fast enough)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updatedTranslationResponse = await apiContext.get(`/admin/api/content/${result.contentId}`);
    const updatedTranslation = await updatedTranslationResponse.json();
    
    console.log('Translation data:', updatedTranslation.data);
    
    // In test environment without real AI, it might use mock service which prefixes [AI EN]
    // Or if AI binding is missing, it might skip.
    // We check if title is at least present.
    expect(updatedTranslation.title).toBeTruthy();
  });
});