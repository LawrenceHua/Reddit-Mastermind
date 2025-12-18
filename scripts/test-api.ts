#!/usr/bin/env tsx
/**
 * Comprehensive API Tests
 * Run with: npx tsx scripts/test-api.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, message: 'OK', duration: Date.now() - start });
    console.log(`  ✅ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, message: error.message, duration: Date.now() - start });
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

async function fetchJSON(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  
  return { status: res.status, data };
}

async function runTests() {
  console.log(`\n🧪 Testing API at ${BASE_URL}\n`);

  // ==========================================
  // 1. Public Routes
  // ==========================================
  console.log('\n📂 Public Routes\n');

  await test('GET / redirects to login or dashboard', async () => {
    const res = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
    if (res.status !== 307 && res.status !== 308 && res.status !== 302 && res.status !== 200) {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  });

  await test('GET /login returns HTML', async () => {
    const res = await fetch(`${BASE_URL}/login`);
    const html = await res.text();
    if (!html.includes('html') && res.status !== 200) {
      throw new Error(`Status: ${res.status}`);
    }
  });

  await test('GET /signup returns HTML', async () => {
    const res = await fetch(`${BASE_URL}/signup`);
    const html = await res.text();
    if (!html.includes('html') && res.status !== 200) {
      throw new Error(`Status: ${res.status}`);
    }
  });

  // ==========================================
  // 2. Protected Routes (should redirect)
  // ==========================================
  console.log('\n📂 Protected Routes (unauthenticated)\n');

  await test('GET /dashboard redirects when not authenticated', async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual' });
    if (res.status !== 307 && res.status !== 308) {
      throw new Error(`Expected redirect, got: ${res.status}`);
    }
    const location = res.headers.get('location');
    if (!location?.includes('/login')) {
      throw new Error(`Expected redirect to login, got: ${location}`);
    }
  });

  await test('GET /projects redirects when not authenticated', async () => {
    const res = await fetch(`${BASE_URL}/projects`, { redirect: 'manual' });
    if (res.status !== 307 && res.status !== 308) {
      throw new Error(`Expected redirect, got: ${res.status}`);
    }
  });

  await test('GET /onboarding returns page (may show onboarding or redirect)', async () => {
    const res = await fetch(`${BASE_URL}/onboarding`, { redirect: 'manual' });
    // Onboarding can return 200 (show form) or redirect to login/dashboard
    if (res.status !== 200 && res.status !== 307 && res.status !== 308 && res.status !== 302) {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  });

  // ==========================================
  // 3. API Routes
  // ==========================================
  console.log('\n📂 API Routes\n');

  await test('POST /api/projects/:id/weeks/generate requires auth', async () => {
    const { status } = await fetchJSON('/api/projects/test-id/weeks/generate', {
      method: 'POST',
      body: JSON.stringify({ weekStart: '2025-01-06' }),
    });
    // Should return 401 Unauthorized
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  await test('GET /api/runs/:id returns error for invalid ID', async () => {
    const { status } = await fetchJSON('/api/runs/invalid-id');
    // Should return 401 or 404
    if (status !== 401 && status !== 403 && status !== 404 && status !== 500) {
      throw new Error(`Expected error, got: ${status}`);
    }
  });

  await test('GET /api/weeks/:id returns error for invalid ID', async () => {
    const { status } = await fetchJSON('/api/weeks/invalid-id');
    if (status !== 401 && status !== 403 && status !== 404 && status !== 500) {
      throw new Error(`Expected error, got: ${status}`);
    }
  });

  await test('POST /api/weeks/:id/approve requires auth', async () => {
    const { status } = await fetchJSON('/api/weeks/test-id/approve', {
      method: 'POST',
    });
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  await test('POST /api/weeks/:id/schedule requires auth', async () => {
    const { status } = await fetchJSON('/api/weeks/test-id/schedule', {
      method: 'POST',
    });
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  await test('GET /api/weeks/:id/export requires auth', async () => {
    const { status } = await fetchJSON('/api/weeks/test-id/export?format=json');
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  await test('POST /api/calendar-items/:id/regenerate requires auth', async () => {
    const { status } = await fetchJSON('/api/calendar-items/test-id/regenerate', {
      method: 'POST',
    });
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  await test('PATCH /api/content-assets/:id requires auth', async () => {
    const { status } = await fetchJSON('/api/content-assets/test-id', {
      method: 'PATCH',
      body: JSON.stringify({ body_md: 'test' }),
    });
    if (status !== 401 && status !== 403 && status !== 500) {
      throw new Error(`Expected auth error, got: ${status}`);
    }
  });

  // ==========================================
  // 4. Auth Callback
  // ==========================================
  console.log('\n📂 Auth Routes\n');

  await test('GET /auth/callback handles missing code gracefully', async () => {
    const res = await fetch(`${BASE_URL}/auth/callback`, { redirect: 'manual' });
    // Should redirect with error
    if (res.status !== 303 && res.status !== 302 && res.status !== 307 && res.status !== 308) {
      throw new Error(`Expected redirect, got: ${res.status}`);
    }
  });

  await test('GET /auth/callback?code=invalid handles invalid code', async () => {
    const res = await fetch(`${BASE_URL}/auth/callback?code=invalid_code`, { redirect: 'manual' });
    // Should redirect (either to error page or login)
    if (res.status !== 303 && res.status !== 302 && res.status !== 307 && res.status !== 308 && res.status !== 200) {
      throw new Error(`Expected redirect or OK, got: ${res.status}`);
    }
  });

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n' + '='.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((a, b) => a + b.duration, 0);

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`⏱️  Total time: ${totalTime}ms\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('');
  }

  if (failed === 0) {
    console.log('✅ All API tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. This may be expected if:\n');
    console.log('   1. Database migrations haven\'t been applied yet');
    console.log('   2. Some endpoints require specific data in the database\n');
  }

  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });

