#!/usr/bin/env tsx
/**
 * Apply database migrations to Supabase
 * Uses the Management API to execute SQL
 */

import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

// Extract project ref from URL
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

if (!projectRef || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

async function applyMigrations() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Applying Database Migrations                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Project: ${projectRef}`);
  console.log(`URL: ${SUPABASE_URL}\n`);

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'combined_migrations.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  console.log(`📄 Migration file: ${migrationPath}`);
  console.log(`📏 Size: ${(migrationSQL.length / 1024).toFixed(1)} KB\n`);

  // Method 1: Try Supabase SQL API (available in some plans)
  console.log('🔄 Attempting to apply via Management API...\n');

  try {
    // The Supabase Management API endpoint for running SQL
    // This requires the service role key and project ref
    const response = await fetch(
      `https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql: migrationSQL }),
      }
    );

    if (response.ok) {
      console.log('✅ Migrations applied successfully via RPC!\n');
      return true;
    }

    const error = await response.text();
    console.log(`   API method not available: ${response.status}\n`);
  } catch (e: any) {
    console.log(`   API method failed: ${e.message}\n`);
  }

  // Method 2: Provide instructions for manual application
  console.log('════════════════════════════════════════════════════════════\n');
  console.log('📋 MANUAL MIGRATION REQUIRED\n');
  console.log('The Supabase SQL execution API is not available. Please apply');
  console.log('migrations manually:\n');
  
  console.log('Option A: Supabase Dashboard (Recommended)');
  console.log('────────────────────────────────────────────');
  console.log(`  1. Open: https://supabase.com/dashboard/project/${projectRef}/sql`);
  console.log('  2. Click "New query"');
  console.log('  3. Copy & paste the contents of:');
  console.log('     supabase/combined_migrations.sql');
  console.log('  4. Click "Run"\n');

  console.log('Option B: Supabase CLI');
  console.log('────────────────────────────────────────────');
  console.log('  1. Install: npm install -g supabase');
  console.log('  2. Login: supabase login');
  console.log(`  3. Link: supabase link --project-ref ${projectRef}`);
  console.log('  4. Push: supabase db push\n');

  console.log('Option C: Direct Postgres Connection');
  console.log('────────────────────────────────────────────');
  console.log('  1. Get connection string from Supabase Dashboard');
  console.log('     Settings > Database > Connection string');
  console.log('  2. Run: psql <connection_string> -f supabase/combined_migrations.sql\n');

  // Create a one-click copy command
  console.log('════════════════════════════════════════════════════════════\n');
  console.log('🔗 Quick Link:');
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql\n`);

  // Try to open the browser on macOS
  try {
    const { exec } = require('child_process');
    exec(`open "https://supabase.com/dashboard/project/${projectRef}/sql"`, (err: any) => {
      if (!err) {
        console.log('🌐 Opening Supabase SQL Editor in browser...\n');
      }
    });
  } catch (e) {
    // Ignore
  }

  return false;
}

applyMigrations().then((success) => {
  if (success) {
    console.log('✅ Database is ready for testing!');
    console.log('   Run: npm run test:e2e:full');
  } else {
    console.log('After applying migrations, re-run this script or:');
    console.log('   npm run test:e2e:full');
  }
}).catch(console.error);

