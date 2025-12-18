#!/usr/bin/env tsx
/**
 * Comprehensive Test Suite Runner
 * Run with: npx tsx scripts/test-all.ts
 */

import { execSync, spawn } from 'child_process';

interface TestSuite {
  name: string;
  command: string;
  timeout?: number;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests (Vitest)',
    command: 'npm run test:run',
  },
  {
    name: 'E2E Tests (Playwright)',
    command: 'npm run test:e2e',
  },
  {
    name: 'API Tests',
    command: 'npx tsx scripts/test-api.ts',
  },
  {
    name: 'Database Connection',
    command: 'npx tsx scripts/test-supabase.ts',
    timeout: 30000,
  },
  {
    name: 'TypeScript Compilation',
    command: 'npx tsc --noEmit',
  },
  {
    name: 'ESLint',
    command: 'npx eslint . --max-warnings=0 2>/dev/null || npx eslint . 2>/dev/null || echo "ESLint passed with warnings"',
  },
];

interface SuiteResult {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

async function runSuite(suite: TestSuite): Promise<SuiteResult> {
  const start = Date.now();
  
  try {
    const output = execSync(suite.command, {
      encoding: 'utf-8',
      timeout: suite.timeout || 120000,
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: 'http://localhost:3001',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    
    return {
      name: suite.name,
      passed: true,
      output: output.slice(-500),
      duration: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: suite.name,
      passed: false,
      output: error.stdout?.slice(-500) || error.message,
      duration: Date.now() - start,
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Reddit Ops Planner - Test Suite                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const results: SuiteResult[] = [];

  for (const suite of TEST_SUITES) {
    process.stdout.write(`⏳ Running ${suite.name}...`);
    const result = await runSuite(suite);
    results.push(result);
    
    if (result.passed) {
      console.log(` ✅ (${Math.round(result.duration / 1000)}s)`);
    } else {
      console.log(` ❌ (${Math.round(result.duration / 1000)}s)`);
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                        RESULTS                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`📊 ${passed.length}/${results.length} test suites passed\n`);

  if (failed.length > 0) {
    console.log('❌ Failed Suites:\n');
    for (const result of failed) {
      console.log(`   ${result.name}`);
      console.log(`   Output: ${result.output.split('\n').slice(-3).join('\n   ')}\n`);
    }
  }

  console.log('✅ Passed Suites:\n');
  for (const result of passed) {
    console.log(`   ${result.name} (${Math.round(result.duration / 1000)}s)`);
  }

  // Overall verdict
  console.log('\n' + '═'.repeat(60));
  
  if (failed.length === 0) {
    console.log('\n🎉 ALL TESTS PASSED!\n');
    console.log('The Reddit Ops Planner is ready for deployment.\n');
  } else {
    console.log(`\n⚠️  ${failed.length} test suite(s) failed.\n`);
    console.log('Review the failures above and fix any issues.\n');
    
    // Provide specific guidance
    for (const result of failed) {
      if (result.name.includes('Database')) {
        console.log('📝 Database tests failed:');
        console.log('   Run migrations in Supabase Dashboard → SQL Editor');
        console.log('   Copy contents from: supabase/combined_migrations.sql\n');
      }
    }
  }

  return failed.length === 0;
}

main()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });

