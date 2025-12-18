#!/usr/bin/env tsx
/**
 * Apply database migrations using direct Postgres connection
 * 
 * Usage:
 *   SUPABASE_DB_URL="postgresql://..." npx tsx scripts/migrate-db.ts
 * 
 * Get your connection string from:
 *   https://supabase.com/dashboard/project/YOUR_PROJECT/settings/database
 *   Section: "Connection string" -> "URI"
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

// Extract project ref from URL
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

// Build connection string if password is provided
let connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString && DB_PASSWORD && projectRef) {
  // Construct Supabase connection string
  // URL encode the password to handle special characters like #
  const encodedPassword = encodeURIComponent(DB_PASSWORD);
  
  // Direct database connection (includes 'db.' prefix)
  // Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
  connectionString = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
}

console.log(`Connection: db.${projectRef}.supabase.co:5432`);

async function applyMigrations() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Applying Database Migrations via Postgres             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!connectionString) {
    console.log('❌ No database connection configured.\n');
    console.log('Please provide one of:');
    console.log('  1. SUPABASE_DB_URL - Full connection string');
    console.log('  2. SUPABASE_DB_PASSWORD - Database password (will construct URL)\n');
    console.log('Get your credentials from:');
    console.log(`  https://supabase.com/dashboard/project/${projectRef || 'YOUR_PROJECT'}/settings/database\n`);
    console.log('Example:');
    console.log('  SUPABASE_DB_URL="postgresql://postgres.xxx:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres" npx tsx scripts/migrate-db.ts\n');
    process.exit(1);
  }

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'combined_migrations.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  console.log(`📄 Migration file: ${migrationPath}`);
  console.log(`📏 Size: ${(migrationSQL.length / 1024).toFixed(1)} KB\n`);

  // Connect to database
  console.log('🔌 Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected!\n');

    // Apply migrations
    console.log('🚀 Applying migrations...');
    console.log('   (This may take a moment)\n');

    await client.query(migrationSQL);

    console.log('✅ Migrations applied successfully!\n');

    // Verify tables exist
    console.log('🔍 Verifying tables...\n');
    const tables = [
      'orgs', 'org_members', 'projects', 'personas', 
      'subreddits', 'topic_seeds', 'calendar_weeks', 
      'calendar_items', 'content_assets', 'generation_runs',
      'quality_scores', 'audit_logs', 'jobs'
    ];

    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);

    const existingTables = rows.map((r: any) => r.table_name);
    let allExist = true;

    for (const table of tables) {
      if (existingTables.includes(table)) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} (missing)`);
        allExist = false;
      }
    }

    console.log('');

    if (allExist) {
      console.log('🎉 All tables created successfully!');
      console.log('\n   Now run: npx tsx scripts/setup-and-test.ts');
    } else {
      console.log('⚠️  Some tables are missing. Check migration errors above.');
    }

    // Notify PostgREST to reload schema
    console.log('\n📢 Notifying PostgREST to reload schema...');
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('   Done!\n');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('already exists')) {
      console.log('\n💡 Some objects already exist. This is usually fine.');
      console.log('   The database may already be set up.');
    }
    
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigrations().catch(console.error);

