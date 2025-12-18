#!/usr/bin/env tsx
/**
 * Check actual database table status and schema cache
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkTables() {
  console.log('🔍 Checking Database Status\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  // Check via information_schema using rpc
  const tables = [
    'orgs', 'org_members', 'projects', 'personas', 
    'subreddits', 'topic_seeds', 'calendar_weeks', 
    'calendar_items', 'content_assets', 'generation_runs',
    'quality_scores', 'audit_logs', 'jobs'
  ];

  console.log('Method 1: Direct SELECT queries');
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        console.log(`  ❌ ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table}: accessible`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${table}: ${e.message}`);
    }
  }

  console.log('\nMethod 2: Direct REST API calls');
  for (const table of tables.slice(0, 3)) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      
      if (res.ok) {
        console.log(`  ✅ ${table}: ${res.status}`);
      } else {
        const text = await res.text();
        console.log(`  ❌ ${table}: ${res.status} - ${text}`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${table}: ${e.message}`);
    }
  }

  // Try to query pg_tables
  console.log('\nMethod 3: Check via pg_catalog (requires schema access)');
  try {
    const { data, error } = await supabase
      .rpc('get_table_info', {});
    
    if (error) {
      console.log(`  Using pg_catalog requires RPC function: ${error.message}`);
    } else {
      console.log('  Tables:', data);
    }
  } catch (e) {
    // Expected to fail
  }

  // Check if we need to reload schema
  console.log('\n📋 Schema Cache Status');
  console.log('  The schema cache appears stale or migrations not applied.');
  console.log('  \nTo fix, run in Supabase SQL Editor:');
  console.log('  NOTIFY pgrst, \'reload schema\';');
  console.log('  \n  Or apply migrations from: supabase/combined_migrations.sql');
}

checkTables().catch(console.error);

