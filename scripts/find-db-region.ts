#!/usr/bin/env tsx
/**
 * Find the correct AWS region for Supabase connection
 */

import { Client } from 'pg';

const projectRef = 'fikyzjrbcqoleqwkmbco';
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error('SUPABASE_DB_PASSWORD required');
  process.exit(1);
}

const encodedPassword = encodeURIComponent(password);
const regions = [
  'us-east-1',
  'us-east-2', 
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-south-1',
  'sa-east-1',
];

async function tryRegion(region: string): Promise<boolean> {
  const connectionString = `postgres://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(`✅ Found! Region: ${region}`);
    await client.end();
    return true;
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.includes('Tenant') || msg.includes('timeout') || msg.includes('ENOTFOUND')) {
      process.stdout.write('.');
    } else {
      console.log(`\n   ${region}: ${msg}`);
    }
    return false;
  }
}

async function findRegion() {
  console.log('🔍 Searching for database region...\n');
  console.log(`Project: ${projectRef}`);
  console.log(`Testing ${regions.length} AWS regions...\n`);
  process.stdout.write('Progress: ');

  for (const region of regions) {
    const found = await tryRegion(region);
    if (found) {
      console.log(`\n\n✅ Your Supabase region is: ${region}`);
      console.log(`\nUse this connection string:`);
      console.log(`  postgres://postgres.${projectRef}:[PASSWORD]@aws-0-${region}.pooler.supabase.com:5432/postgres\n`);
      return region;
    }
  }

  console.log('\n\n❌ Could not find your region.');
  console.log('\nPlease get your connection string from:');
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/settings/database`);
  console.log('\nLook for "Connection string" -> "URI" (Session mode)\n');
  return null;
}

findRegion().catch(console.error);

