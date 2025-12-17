import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seed() {
  console.log('🌱 Starting seed...');

  // Create test user (in dev, create via Supabase dashboard or auth API)
  const testUserId = '00000000-0000-0000-0000-000000000001';

  // Create organization
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .insert({ name: 'SlideForge Inc.' })
    .select()
    .single();

  if (orgError) {
    console.error('Failed to create org:', orgError);
    return;
  }

  console.log('✅ Created org:', org.id);

  // Create org member (link test user to org)
  await supabase.from('org_members').insert({
    org_id: org.id,
    user_id: testUserId,
    role: 'admin',
  });

  // Create project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      org_id: org.id,
      name: 'SlideForge Reddit Campaign',
      company_profile_json: {
        name: 'SlideForge',
        description:
          'AI-powered presentation builder that turns bullet points into beautiful slides',
        website: 'https://slideforge.ai',
        industry: 'SaaS / Productivity',
      },
      brand_voice_json: {
        tone: 'helpful, knowledgeable, casual',
        keywords: ['presentations', 'AI', 'productivity', 'design'],
      },
      posts_per_week: 5,
      risk_tolerance: 'medium',
    })
    .select()
    .single();

  if (projectError) {
    console.error('Failed to create project:', projectError);
    return;
  }

  console.log('✅ Created project:', project.id);

  // Create personas
  const personas = [
    {
      project_id: project.id,
      name: 'Alex',
      bio: 'Startup founder who has given 100+ investor pitches. Passionate about helping others communicate their ideas clearly.',
      tone: 'casual',
      expertise_tags: ['startups', 'pitching', 'fundraising'],
      disclosure_rules_json: { required: false },
      active: true,
    },
    {
      project_id: project.id,
      name: 'Jordan',
      bio: 'Product designer who transitioned from consulting. Creates educational content about design and presentations.',
      tone: 'professional',
      expertise_tags: ['design', 'consulting', 'education'],
      disclosure_rules_json: { required: true },
      active: true,
    },
    {
      project_id: project.id,
      name: 'Sam',
      bio: 'Sales enablement specialist. Helps teams create compelling decks that close deals.',
      tone: 'friendly',
      expertise_tags: ['sales', 'b2b', 'enablement'],
      disclosure_rules_json: { required: false },
      active: true,
    },
  ];

  const { data: createdPersonas } = await supabase.from('personas').insert(personas).select();

  console.log('✅ Created personas:', createdPersonas?.length);

  // Create subreddits
  const subreddits = [
    {
      project_id: project.id,
      name: 'startups',
      rules_text: 'No direct promotional posts. Share value first.',
      risk_level: 'medium',
      max_posts_per_week: 2,
    },
    {
      project_id: project.id,
      name: 'SaaS',
      rules_text: 'Founders and builders welcome. Self-promo in designated threads only.',
      risk_level: 'low',
      max_posts_per_week: 2,
    },
    {
      project_id: project.id,
      name: 'Entrepreneur',
      rules_text: 'Discussion-focused. No spam or excessive self-promotion.',
      risk_level: 'medium',
      max_posts_per_week: 1,
    },
    {
      project_id: project.id,
      name: 'productivity',
      rules_text: 'Tools and tips welcome. Keep it helpful.',
      risk_level: 'low',
      max_posts_per_week: 2,
    },
    {
      project_id: project.id,
      name: 'consulting',
      rules_text: 'Professional community. No solicitation.',
      risk_level: 'high',
      max_posts_per_week: 1,
    },
  ];

  const { data: createdSubreddits } = await supabase.from('subreddits').insert(subreddits).select();

  console.log('✅ Created subreddits:', createdSubreddits?.length);

  // Create topic seeds
  const topicSeeds = [
    {
      project_id: project.id,
      seed_type: 'target_query' as const,
      text: 'How to create investor pitch deck',
      tags: ['pitch', 'investors', 'fundraising'],
      priority: 10,
      active: true,
    },
    {
      project_id: project.id,
      seed_type: 'target_query' as const,
      text: 'Best tools for making presentations quickly',
      tags: ['tools', 'productivity', 'presentations'],
      priority: 9,
      active: true,
    },
    {
      project_id: project.id,
      seed_type: 'pain_point' as const,
      text: 'Spending too much time on slide design instead of content',
      tags: ['time', 'design', 'efficiency'],
      priority: 8,
      active: true,
    },
    {
      project_id: project.id,
      seed_type: 'pain_point' as const,
      text: 'PowerPoint templates all look the same',
      tags: ['templates', 'design', 'uniqueness'],
      priority: 7,
      active: true,
    },
    {
      project_id: project.id,
      seed_type: 'faq' as const,
      text: 'How many slides should a pitch deck have?',
      tags: ['pitch', 'length', 'best-practices'],
      priority: 6,
      active: true,
    },
    {
      project_id: project.id,
      seed_type: 'competitor' as const,
      text: 'Canva vs PowerPoint vs Google Slides for presentations',
      tags: ['comparison', 'tools', 'alternatives'],
      priority: 5,
      active: true,
    },
  ];

  const { data: createdSeeds } = await supabase.from('topic_seeds').insert(topicSeeds).select();

  console.log('✅ Created topic seeds:', createdSeeds?.length);

  console.log('\n🎉 Seed complete!');
  console.log(`
  Summary:
  - Org ID: ${org.id}
  - Project ID: ${project.id}
  - Personas: ${createdPersonas?.length}
  - Subreddits: ${createdSubreddits?.length}
  - Topic Seeds: ${createdSeeds?.length}
  
  Next steps:
  1. Create a user in Supabase Auth with ID: ${testUserId}
  2. Or update the testUserId in this script to match an existing user
  3. Navigate to the project to start generating content
  `);
}

seed().catch(console.error);
