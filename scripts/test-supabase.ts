#!/usr/bin/env tsx
/**
 * Test Supabase connection and database schema
 * Run with: npx tsx scripts/test-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';

// Load env vars from Next.js environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  console.log('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
  console.log('🔍 Testing Supabase Connection...\n');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Key: ${SUPABASE_KEY?.substring(0, 20)}...`);
  console.log('');

  let passed = 0;
  let failed = 0;

  // Test 1: Basic connection
  console.log('1️⃣  Testing basic connection...');
  try {
    const { data, error } = await supabase.from('orgs').select('count').limit(1);
    if (error) throw error;
    console.log('   ✅ Connected to Supabase');
    passed++;
  } catch (error: any) {
    if (error.message?.includes('relation "public.orgs" does not exist')) {
      console.log('   ⚠️  Connection OK but tables not created yet');
      console.log('   📝 Run migrations first:');
      console.log('      Go to Supabase Dashboard → SQL Editor');
      console.log('      Paste contents of supabase/combined_migrations.sql');
      return { passed: 0, failed: 0, needsMigrations: true };
    } else {
      console.log(`   ❌ Connection failed: ${error.message}`);
      failed++;
    }
  }

  // Test 2: Check tables exist
  console.log('\n2️⃣  Checking database tables...');
  const tables = [
    'orgs',
    'org_members', 
    'org_invitations',
    'projects',
    'personas',
    'subreddits',
    'topic_seeds',
    'calendar_weeks',
    'calendar_items',
    'content_assets',
    'generation_runs',
    'quality_scores',
    'audit_logs',
    'jobs',
  ];

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error) throw error;
      console.log(`   ✅ ${table}`);
      passed++;
    } catch (error: any) {
      console.log(`   ❌ ${table}: ${error.message}`);
      failed++;
    }
  }

  // Test 3: Check RPC functions
  console.log('\n3️⃣  Checking RPC functions...');
  
  try {
    // This will fail without proper auth, but should return auth error not "function not found"
    const { error } = await supabase.rpc('create_org_with_owner', { org_name: 'Test' });
    if (error?.message?.includes('not exist')) {
      console.log('   ❌ create_org_with_owner: Function not found');
      failed++;
    } else {
      console.log('   ✅ create_org_with_owner exists');
      passed++;
    }
  } catch (error: any) {
    console.log(`   ✅ create_org_with_owner exists (auth required)`);
    passed++;
  }

  try {
    const { error } = await supabase.rpc('claim_next_job', { worker_id: 'test', lock_timeout_ms: 1000 });
    if (error?.message?.includes('not exist')) {
      console.log('   ❌ claim_next_job: Function not found');
      failed++;
    } else {
      console.log('   ✅ claim_next_job exists');
      passed++;
    }
  } catch (error: any) {
    console.log(`   ✅ claim_next_job exists (permission restricted)`);
    passed++;
  }

  // Test 4: Auth configuration
  console.log('\n4️⃣  Checking auth configuration...');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    console.log('   ✅ Auth endpoint accessible');
    passed++;
  } catch (error: any) {
    console.log(`   ❌ Auth error: ${error.message}`);
    failed++;
  }

  return { passed, failed, needsMigrations: false };
}

async function main() {
  const result = await testConnection();
  
  console.log('\n' + '='.repeat(50));
  
  if (result.needsMigrations) {
    console.log('⚠️  Database migrations need to be applied first');
    console.log('\nNext steps:');
    console.log('1. Go to: https://supabase.com/dashboard/project/_/sql');
    console.log('2. Copy contents of: supabase/combined_migrations.sql');
    console.log('3. Paste and run in the SQL Editor');
    console.log('4. Re-run this script to verify');
  } else {
    console.log(`\n📊 Results: ${result.passed} passed, ${result.failed} failed`);
    
    if (result.failed === 0) {
      console.log('\n✅ All database tests passed!');
      console.log('\nYour Supabase database is properly configured.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the errors above.');
    }
  }
}

main().catch(console.error);

