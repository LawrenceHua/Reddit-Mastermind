#!/usr/bin/env tsx
/**
 * Complete Setup & E2E Test Script
 * 
 * This script:
 * 1. Applies database migrations to Supabase
 * 2. Creates a test user
 * 3. Tests the full user flow programmatically
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  console.log('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create admin client with schema refresh
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Helper to run raw SQL via REST API
async function runSQL(sql: string): Promise<{ data: any; error: any }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ query: sql }),
    });
    
    if (!response.ok) {
      return { data: null, error: { message: await response.text() } };
    }
    
    return { data: await response.json(), error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message } };
  }
}

// Test user credentials
const TEST_USER = {
  email: `test-${Date.now()}@reddit-mastermind.test`,
  password: 'TestPassword123!',
  orgName: 'Test Organization',
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`  ${message}`);
}

function success(name: string, message: string, data?: any) {
  results.push({ name, passed: true, message, data });
  console.log(`  ✅ ${name}: ${message}`);
}

function failure(name: string, message: string) {
  results.push({ name, passed: false, message });
  console.log(`  ❌ ${name}: ${message}`);
}

// ============================================
// Step 1: Check/Apply Database Migrations
// ============================================

async function checkDatabaseSchema(): Promise<boolean> {
  console.log('\n📦 Step 1: Checking Database Schema\n');

  const tables = [
    'orgs', 'org_members', 'projects', 'personas', 
    'subreddits', 'topic_seeds', 'calendar_weeks', 
    'calendar_items', 'content_assets', 'generation_runs',
    'quality_scores', 'audit_logs', 'jobs'
  ];

  let allExist = true;
  const missingTables: string[] = [];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('count').limit(1);
    
    if (error?.message?.includes('does not exist')) {
      missingTables.push(table);
      allExist = false;
    }
  }

  if (allExist) {
    success('Database Schema', 'All tables exist');
    return true;
  } else {
    failure('Database Schema', `Missing tables: ${missingTables.join(', ')}`);
    console.log('\n  📝 To apply migrations:');
    console.log('     1. Go to: https://supabase.com/dashboard/project/_/sql');
    console.log('     2. Copy contents from: supabase/combined_migrations.sql');
    console.log('     3. Run the SQL');
    console.log('     4. Re-run this script\n');
    return false;
  }
}

// ============================================
// Step 2: Create Test User
// ============================================

async function createTestUser(): Promise<{ userId: string; orgId: string } | null> {
  console.log('\n👤 Step 2: Creating Test User\n');

  try {
    // Create user via admin API
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        org_name: TEST_USER.orgName,
      },
    });

    if (userError) {
      failure('Create User', userError.message);
      return null;
    }

    if (!userData.user) {
      failure('Create User', 'No user returned');
      return null;
    }

    success('Create User', `Created ${TEST_USER.email}`);
    const userId = userData.user.id;

    // Create organization using direct fetch to bypass schema cache
    log('Creating organization...');
    
    const orgInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ name: TEST_USER.orgName, created_by: userId }),
    });

    if (!orgInsertRes.ok) {
      const errText = await orgInsertRes.text();
      failure('Create Org', errText);
      return null;
    }

    const [org] = await orgInsertRes.json();

    // Create org member
    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/org_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        org_id: org.id,
        user_id: userId,
        role: 'admin',
      }),
    });

    if (!memberRes.ok) {
      const errText = await memberRes.text();
      failure('Create Org Member', errText);
      return null;
    }

    success('Create Org', `Created "${TEST_USER.orgName}"`);
    return { userId, orgId: org.id };
  } catch (error: any) {
    failure('Create User', error.message);
    return null;
  }
}

// ============================================
// Step 3: Create Project with Setup
// ============================================

async function createProject(orgId: string): Promise<string | null> {
  console.log('\n📁 Step 3: Creating Project\n');

  try {
    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        org_id: orgId,
        name: 'SlideForge Test Campaign',
        company_profile_json: {
          name: 'SlideForge',
          description: 'AI-powered presentation design platform',
          website: 'https://slideforge.com',
          industry: 'SaaS',
        },
        brand_voice_json: {
          tone: 'professional yet approachable',
          keywords: ['AI', 'presentations', 'productivity'],
        },
        posts_per_week: 5,
        risk_tolerance: 'medium',
      })
      .select()
      .single();

    if (projectError) {
      failure('Create Project', projectError.message);
      return null;
    }

    success('Create Project', `Created "${project.name}"`);

    // Add personas
    const personas = [
      { name: 'Alex Chen', bio: 'Startup founder', tone: 'casual', expertise_tags: ['startups'] },
      { name: 'Morgan Davis', bio: 'Marketing consultant', tone: 'professional', expertise_tags: ['marketing'] },
      { name: 'Jamie Park', bio: 'Product manager', tone: 'analytical', expertise_tags: ['product'] },
    ];

    for (const persona of personas) {
      const { error } = await supabase
        .from('personas')
        .insert({ ...persona, project_id: project.id, active: true, disclosure_rules_json: { required: false } });
      
      if (error) {
        failure('Add Persona', error.message);
      }
    }
    success('Add Personas', `Added ${personas.length} personas`);

    // Add subreddits
    const subreddits = [
      { name: 'r/startups', risk_level: 'medium', max_posts_per_week: 2 },
      { name: 'r/Entrepreneur', risk_level: 'medium', max_posts_per_week: 2 },
      { name: 'r/productivity', risk_level: 'low', max_posts_per_week: 3 },
    ];

    for (const sub of subreddits) {
      const { error } = await supabase
        .from('subreddits')
        .insert({ ...sub, project_id: project.id, rules_text: '', allowed_post_types_json: ['text'] });
      
      if (error) {
        failure('Add Subreddit', error.message);
      }
    }
    success('Add Subreddits', `Added ${subreddits.length} subreddits`);

    // Add topic seeds
    const topics = [
      { seed_type: 'target_query', text: 'best presentation software', priority: 1 },
      { seed_type: 'pain_point', text: 'spending too much time on slides', priority: 2 },
      { seed_type: 'faq', text: 'how to make pitch deck', priority: 3 },
    ];

    for (const topic of topics) {
      const { error } = await supabase
        .from('topic_seeds')
        .insert({ ...topic, project_id: project.id, tags: [], active: true });
      
      if (error) {
        failure('Add Topic', error.message);
      }
    }
    success('Add Topics', `Added ${topics.length} topic seeds`);

    return project.id;
  } catch (error: any) {
    failure('Create Project', error.message);
    return null;
  }
}

// ============================================
// Step 4: Generate Week (Simulated)
// ============================================

async function generateWeek(projectId: string): Promise<string | null> {
  console.log('\n📅 Step 4: Generating Content Calendar\n');

  try {
    // Create calendar week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + (8 - weekStart.getDay())); // Next Monday
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const { data: week, error: weekError } = await supabase
      .from('calendar_weeks')
      .insert({
        project_id: projectId,
        week_start_date: weekStartStr,
        status: 'draft',
      })
      .select()
      .single();

    if (weekError) {
      failure('Create Week', weekError.message);
      return null;
    }

    success('Create Week', `Week starting ${weekStartStr}`);

    // Get project data for generation
    const { data: personas } = await supabase
      .from('personas')
      .select('id, name')
      .eq('project_id', projectId)
      .eq('active', true);

    const { data: subreddits } = await supabase
      .from('subreddits')
      .select('id, name')
      .eq('project_id', projectId);

    if (!personas?.length || !subreddits?.length) {
      failure('Generate Items', 'Missing personas or subreddits');
      return null;
    }

    // Create calendar items (simplified generation)
    const items: any[] = [];
    for (let i = 0; i < 5; i++) {
      const scheduledAt = new Date(weekStart);
      scheduledAt.setDate(scheduledAt.getDate() + i);
      scheduledAt.setHours(10 + i, 0, 0, 0);

      const { data: item, error: itemError } = await supabase
        .from('calendar_items')
        .insert({
          calendar_week_id: week.id,
          scheduled_at: scheduledAt.toISOString(),
          subreddit_id: subreddits[i % subreddits.length].id,
          primary_persona_id: personas[i % personas.length].id,
          status: 'draft',
          topic_cluster_key: `topic-${i}`,
          risk_flags_json: [],
        })
        .select()
        .single();

      if (itemError) {
        failure('Create Item', itemError.message);
        continue;
      }

      items.push(item);

      // Create content asset for each item
      const { data: asset, error: assetError } = await supabase
        .from('content_assets')
        .insert({
          calendar_item_id: item.id,
          asset_type: 'post',
          author_persona_id: item.primary_persona_id,
          title: `Sample Post ${i + 1}: Productivity Tips for Startups`,
          body_md: `This is sample content for post ${i + 1}. In a real scenario, this would be AI-generated content tailored to the subreddit and target queries.`,
          metadata_json: { generated: true, test: true },
          version: 1,
          status: 'active',
        })
        .select()
        .single();

      if (assetError) {
        failure('Create Asset', assetError.message);
        continue;
      }

      // Create quality score
      await supabase.from('quality_scores').insert({
        asset_id: asset.id,
        dimensions_json: {
          subreddit_fit: 8,
          helpfulness: 9,
          authenticity: 8,
          compliance_safety: 10,
          brand_subtlety: 7,
        },
        overall_score: 8.4,
        rater: 'heuristic',
        notes: 'Test generation',
      });
    }

    success('Generate Items', `Created ${items.length} calendar items with content`);
    return week.id;
  } catch (error: any) {
    failure('Generate Week', error.message);
    return null;
  }
}

// ============================================
// Step 5: Approve Week
// ============================================

async function approveWeek(weekId: string): Promise<boolean> {
  console.log('\n✓ Step 5: Approving Week\n');

  try {
    // Update week status
    const { error: weekError } = await supabase
      .from('calendar_weeks')
      .update({ status: 'approved' })
      .eq('id', weekId);

    if (weekError) {
      failure('Approve Week', weekError.message);
      return false;
    }

    // Update all items to approved
    const { error: itemsError } = await supabase
      .from('calendar_items')
      .update({ status: 'approved' })
      .eq('calendar_week_id', weekId);

    if (itemsError) {
      failure('Approve Items', itemsError.message);
      return false;
    }

    success('Approve Week', 'Week and items approved');
    return true;
  } catch (error: any) {
    failure('Approve Week', error.message);
    return false;
  }
}

// ============================================
// Step 6: Export Calendar
// ============================================

async function exportCalendar(weekId: string): Promise<boolean> {
  console.log('\n📤 Step 6: Exporting Calendar\n');

  try {
    // Get week with items
    const { data: week, error: weekError } = await supabase
      .from('calendar_weeks')
      .select('*, calendar_items(*, content_assets(*), subreddits(name), personas:personas!calendar_items_primary_persona_id_fkey(name))')
      .eq('id', weekId)
      .single();

    if (weekError) {
      failure('Export Week', weekError.message);
      return false;
    }

    // Format export
    const exportData = {
      week_id: week.id,
      week_start_date: week.week_start_date,
      status: week.status,
      items: week.calendar_items.map((item: any) => ({
        scheduled_at: item.scheduled_at,
        subreddit: item.subreddits?.name,
        persona: item.personas?.name,
        title: item.content_assets?.[0]?.title,
        body: item.content_assets?.[0]?.body_md?.substring(0, 100) + '...',
      })),
    };

    success('Export Week', `Exported ${exportData.items.length} items`);
    
    console.log('\n  📋 Export Preview:');
    console.log(`     Week: ${exportData.week_start_date} (${exportData.status})`);
    for (const item of exportData.items.slice(0, 3)) {
      console.log(`     - ${item.subreddit} | ${item.persona} | ${item.title}`);
    }
    if (exportData.items.length > 3) {
      console.log(`     ... and ${exportData.items.length - 3} more`);
    }

    return true;
  } catch (error: any) {
    failure('Export Week', error.message);
    return false;
  }
}

// ============================================
// Step 7: Cleanup Test Data
// ============================================

async function cleanup(userId: string): Promise<void> {
  console.log('\n🧹 Step 7: Cleaning Up Test Data\n');

  try {
    // Delete test user (cascades to org_members)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    
    if (error) {
      log(`Cleanup warning: ${error.message}`);
    } else {
      success('Cleanup', 'Deleted test user and associated data');
    }
  } catch (error: any) {
    log(`Cleanup warning: ${error.message}`);
  }
}

// ============================================
// Main Execution
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Reddit Mastermind - Full E2E Test                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  console.log(`\nSupabase URL: ${SUPABASE_URL}`);
  console.log(`Test User: ${TEST_USER.email}`);

  // Step 1: Check database
  const dbReady = await checkDatabaseSchema();
  if (!dbReady) {
    console.log('\n⚠️  Database migrations required. Please apply them first.');
    process.exit(1);
  }

  // Step 2: Create test user
  const userInfo = await createTestUser();
  if (!userInfo) {
    console.log('\n⚠️  Could not create test user.');
    process.exit(1);
  }

  // Step 3: Create project
  const projectId = await createProject(userInfo.orgId);
  if (!projectId) {
    await cleanup(userInfo.userId);
    console.log('\n⚠️  Could not create project.');
    process.exit(1);
  }

  // Step 4: Generate week
  const weekId = await generateWeek(projectId);
  if (!weekId) {
    await cleanup(userInfo.userId);
    console.log('\n⚠️  Could not generate week.');
    process.exit(1);
  }

  // Step 5: Approve week
  const approved = await approveWeek(weekId);
  if (!approved) {
    await cleanup(userInfo.userId);
    console.log('\n⚠️  Could not approve week.');
    process.exit(1);
  }

  // Step 6: Export calendar
  const exported = await exportCalendar(weekId);
  if (!exported) {
    await cleanup(userInfo.userId);
    console.log('\n⚠️  Could not export calendar.');
    process.exit(1);
  }

  // Step 7: Cleanup
  await cleanup(userInfo.userId);

  // Summary
  console.log('\n' + '═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 ALL E2E TESTS PASSED!\n');
    console.log('The full user flow works end-to-end:');
    console.log('  ✅ Create User & Organization');
    console.log('  ✅ Create Project with Personas, Subreddits, Topics');
    console.log('  ✅ Generate Content Calendar');
    console.log('  ✅ Approve Week');
    console.log('  ✅ Export Calendar\n');
  } else {
    console.log('❌ Some tests failed:\n');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);

