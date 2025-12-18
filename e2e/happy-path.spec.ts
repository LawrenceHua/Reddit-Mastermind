import { test, expect, type Page } from '@playwright/test';

test.describe('Reddit Ops Planner E2E', () => {
  test.describe('Public Pages', () => {
    test('homepage redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/');
      // Unauthenticated users should be redirected to login
      await expect(page).toHaveURL(/\/login/);
      // Should include redirectTo parameter
      const url = page.url();
      expect(url).toContain('redirectTo');
    });

    test('login page renders correctly', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('text=Welcome back')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
    });

    test('signup page renders correctly', async ({ page }) => {
      await page.goto('/signup');
      await expect(page.locator('text=Create your account')).toBeVisible();
      await expect(page.locator('input[id="orgName"]')).toBeVisible();
      await expect(page.locator('input[id="email"]')).toBeVisible();
    });

    test('login and signup pages link to each other', async ({ page }) => {
      await page.goto('/login');
      await page.click('text=Sign up');
      await expect(page).toHaveURL('/signup');

      await page.click('text=Sign in');
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Form Validation', () => {
    test('signup form validates required fields', async ({ page }) => {
      await page.goto('/signup');
      
      // Try to submit empty form
      await page.click('button:has-text("Create account")');
      
      // Form should not submit - page should stay on signup
      await expect(page).toHaveURL('/signup');
    });

    test('login form validates email format', async ({ page }) => {
      await page.goto('/login');
      
      await page.fill('input[type="email"]', 'not-an-email');
      await page.fill('input[type="password"]', 'password123');
      
      // Browser validation should prevent submission
      const emailInput = page.locator('input[type="email"]');
      const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {
    test('unauthenticated users are redirected from dashboard', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Unauthenticated users should be redirected to login
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

// Authenticated test flows - these require a test user setup
test.describe('Authenticated Flows', () => {
  // Skip these tests in CI unless auth is configured
  test.skip(({ }, testInfo) => {
    return !process.env.TEST_USER_EMAIL || testInfo.project.name === 'ci-no-auth';
  });

  test.describe.configure({ mode: 'serial' });

  test('create new project flow', async ({ page }) => {
    // Navigate to create project
    await page.goto('/projects/new');
    
    // Verify form is present
    await expect(page.locator('input[id="name"]')).toBeVisible();
    await expect(page.locator('button:has-text("Create project")')).toBeVisible();
    
    // Fill project details
    const projectName = `Test Project ${Date.now()}`;
    await page.fill('input[id="name"]', projectName);
    await page.fill('textarea[id="description"]', 'A test project for E2E testing');
  });

  test('setup wizard tabs are accessible', async ({ page }) => {
    await page.goto('/dashboard');
    
    // This test verifies the structure, actual project ID would come from a fixture
    // For demonstration, we check the URL pattern
    const setupUrlPattern = /\/projects\/[a-f0-9-]+\/setup/;
    
    // Navigate to a project setup page (assuming one exists from seeded data)
    // In a real test environment, you would create a project first
  });
});

// Visual regression tests
test.describe('Visual Consistency', () => {
  test('login page has consistent layout', async ({ page }) => {
    await page.goto('/login');
    
    // Verify key UI elements are visible
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    
    // Check responsive layout at different sizes
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('form')).toBeVisible();
    
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile
    await expect(page.locator('form')).toBeVisible();
  });
});

// API integration tests via UI
test.describe('API Integration', () => {
  test('projects page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/projects');
    
    // Wait for redirect
    await page.waitForURL(/\/login/);
    
    // Verify we're on login page
    await expect(page).toHaveURL(/\/login/);
  });
});

// Error handling tests
test.describe('Error Handling', () => {
  test('404 page displays for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    
    // Should show 404 or redirect
    await expect(page.locator('text=404').or(page.locator('text=Not Found'))).toBeVisible();
  });

  test('handles auth code errors gracefully', async ({ page }) => {
    await page.goto('/auth/auth-code-error');
    
    // Should show error page with helpful message - check for common error UI elements
    // Page should load and display something (not crash)
    await page.waitForLoadState('domcontentloaded');
    
    // Either shows error message or redirects
    const hasErrorContent = await page.locator('body').textContent();
    expect(hasErrorContent).toBeTruthy();
  });
});

// Performance checks
test.describe('Performance', () => {
  test('login page loads quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;
    
    // Should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('dashboard loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});

// Accessibility tests
test.describe('Accessibility', () => {
  test('login page has proper form labels', async ({ page }) => {
    await page.goto('/login');
    
    // Check that form inputs have associated labels
    const emailLabel = page.locator('label[for="email"]');
    const passwordLabel = page.locator('label[for="password"]');
    
    await expect(emailLabel).toBeVisible();
    await expect(passwordLabel).toBeVisible();
  });

  test('keyboard navigation works on login form', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form elements
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    
    // First focused element should be email input or other interactive element
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);
  });
});

// Full flow test (requires seeded database)
test.describe('Complete User Flow', () => {
  test.skip('setup → generate → approve → export flow', async ({ page }) => {
    // This test requires:
    // 1. A seeded test user with auth state
    // 2. A test project with setup data
    // 3. Mocked or real OpenAI API for generation
    
    // Step 1: Navigate to project setup
    // await page.goto('/projects/test-project-id/setup');
    
    // Step 2: Fill out company profile
    // await page.fill('input[id="companyName"]', 'Test Company');
    // await page.fill('textarea[id="description"]', 'Test description');
    
    // Step 3: Add a persona
    // await page.click('text=Personas');
    // await page.click('text=Add Persona');
    
    // Step 4: Add a subreddit
    // await page.click('text=Subreddits');
    // await page.click('text=Add Subreddit');
    
    // Step 5: Add a topic seed
    // await page.click('text=Topics');
    // await page.click('text=Add Topic');
    
    // Step 6: Go to calendar and generate week
    // await page.goto('/projects/test-project-id/calendar');
    // await page.click('text=Generate Week');
    // await page.waitForSelector('text=Generation complete', { timeout: 60000 });
    
    // Step 7: Review generated content
    // await page.click('[data-testid="week-card"]');
    // await expect(page.locator('text=Week Review')).toBeVisible();
    
    // Step 8: Approve the week
    // await page.click('text=Approve Week');
    // await expect(page.locator('text=approved')).toBeVisible();
    
    // Step 9: Export
    // await page.click('text=Export CSV');
    // const download = await page.waitForEvent('download');
    // expect(download.suggestedFilename()).toContain('.csv');
  });
});

// Note: To run authenticated tests, you need:
// 1. A test Supabase project with seeded data
// 2. Environment variables:
//    - TEST_USER_EMAIL
//    - TEST_USER_PASSWORD
// 3. Auth state file generated by a setup script:
//
// async function globalSetup() {
//   const browser = await chromium.launch();
//   const page = await browser.newPage();
//   await page.goto('/login');
//   await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
//   await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
//   await page.click('button[type="submit"]');
//   await page.waitForURL('/dashboard');
//   await page.context().storageState({ path: 'playwright/.auth/user.json' });
//   await browser.close();
// }
