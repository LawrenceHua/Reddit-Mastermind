#!/usr/bin/env tsx
/**
 * Test script to verify environment variables are set correctly
 * Run with: npx tsx scripts/test-env.ts
 * 
 * Note: Make sure .env.local exists in the project root
 */

console.log('🔍 Testing Environment Variables...\n');

// Required client-side vars
const clientVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

// Required server-side vars
const serverVars = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

// Optional vars
const optionalVars = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000 (default)',
  NODE_ENV: process.env.NODE_ENV || 'development (default)',
};

let allValid = true;

console.log('📋 Client-Side Variables (NEXT_PUBLIC_*):');
for (const [key, value] of Object.entries(clientVars)) {
  const isValid = !!value && value.length > 0;
  const displayValue = value
    ? `${value.substring(0, 30)}...${value.length > 30 ? ` (${value.length} chars)` : ''}`
    : '❌ MISSING';
  console.log(`  ${isValid ? '✅' : '❌'} ${key}: ${displayValue}`);
  if (!isValid) allValid = false;
}

console.log('\n🔒 Server-Side Variables:');
for (const [key, value] of Object.entries(serverVars)) {
  const isValid = !!value && value.length > 0;
  const displayValue = value
    ? `${value.substring(0, 20)}...${value.length > 20 ? ` (${value.length} chars)` : ''}`
    : '❌ MISSING';
  console.log(`  ${isValid ? '✅' : '❌'} ${key}: ${displayValue}`);
  if (!isValid) allValid = false;
}

console.log('\n⚙️  Optional Variables:');
for (const [key, value] of Object.entries(optionalVars)) {
  console.log(`  ℹ️  ${key}: ${value}`);
}

// Test Supabase URL format
console.log('\n🔗 Supabase URL Validation:');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (supabaseUrl) {
  const isValidUrl = supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co');
  console.log(`  ${isValidUrl ? '✅' : '⚠️'} URL format: ${isValidUrl ? 'Valid' : 'Invalid (should be https://*.supabase.co)'}`);
  if (!isValidUrl) allValid = false;
} else {
  console.log('  ❌ No Supabase URL found');
  allValid = false;
}

// Test OpenAI API key format
console.log('\n🤖 OpenAI API Key Validation:');
const openaiKey = process.env.OPENAI_API_KEY;
if (openaiKey) {
  const isValidFormat = openaiKey.startsWith('sk-');
  console.log(`  ${isValidFormat ? '✅' : '⚠️'} Key format: ${isValidFormat ? 'Valid (starts with sk-)' : 'Invalid (should start with sk-)'}`);
  if (!isValidFormat) allValid = false;
} else {
  console.log('  ❌ No OpenAI API key found');
  allValid = false;
}

console.log('\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ All required environment variables are set correctly!');
  console.log('\nNext steps:');
  console.log('  1. Run migrations: supabase db push');
  console.log('  2. Deploy Edge Function: supabase functions deploy worker_tick');
  console.log('  3. Set OPENAI_API_KEY in Edge Function secrets');
  console.log('  4. Start dev server: npm run dev');
} else {
  console.log('❌ Some environment variables are missing or invalid.');
  console.log('   Please check your .env.local file and ENV_SETUP.md for guidance.');
  process.exit(1);
}

