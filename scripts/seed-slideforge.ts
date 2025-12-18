/**
 * Seed script to create a demo Slideforge project
 * Based on Maddie's sample content calendar
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('supabaseUrl:', supabaseUrl ? 'set' : 'missing');
  console.log('supabaseKey:', supabaseKey ? 'set' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Slideforge Company Info
const COMPANY_INFO = {
  name: 'Slideforge',
  website: 'slideforge.ai',
  description: `Slideforge is an AI-powered presentation and storytelling tool that turns outlines or rough notes into polished, professional slide decks.

Users can paste content, choose a style, and let the AI generate structured layouts, visuals, and narrative flow that are fully editable.

Slideforge supports exporting to PowerPoint, Google Slides, and PDF, and can produce branded templates automatically.

They also offer an API so teams can integrate Slideforge's slide-generation engine into internal tools or workflows.`,
  industry: 'SaaS / Productivity / AI Tools',
  icp: 'Startup operators, consultants, sales teams, educators, content creators',
};

// Detailed Personas (exactly as provided)
const PERSONAS = [
  {
    name: 'riley_ops',
    display_name: 'Riley Hart',
    bio: `Head of operations at a SaaS startup. Grew up in Colorado with parents who believed anything worth doing was worth doing with precision. Became the unofficial owner of every deck that mattered - board updates, sales narratives, internal strategy. Runs every morning before work. Has a Miro board inspired by comic strips for narrative pacing. Blocks Wednesday afternoons as sacred catchup time.`,
    tone: 'Professional but relatable, detail-oriented, slightly perfectionist. Uses "I" perspective, shares personal struggles with formatting.',
    disclosure_required: false,
    reddit_age_months: 24,
  },
  {
    name: 'jordan_consults',
    display_name: 'Jordan Brooks',
    bio: `Independent consultant who works with early stage founders. Grew up in a Black family in Maryland where storytelling was the glue that held everyone together. Grandfather could turn a simple drive to the barbershop into a story about luck, timing, and human nature. Works at a small cafe for background noise. Handwrites tricky analysis sections. Keeps an archive of the best decks ever seen.`,
    tone: 'Thoughtful, narrative-focused, appreciates craft. Speaks from experience, offers balanced perspectives.',
    disclosure_required: false,
    reddit_age_months: 36,
  },
  {
    name: 'emily_econ',
    display_name: 'Emily Chen',
    bio: `Senior majoring in economics at a big state university. Taiwanese American family where school was non-negotiable. Mom kept every award certificate in plastic sleeves. Became the unofficial slide maker for every group. Works on the library's quiet floor at 8am. Keeps a Google Drive folder of reusable charts.`,
    tone: 'Younger, relatable student perspective. Uses casual language, "+1" style comments, genuine enthusiasm.',
    disclosure_required: false,
    reddit_age_months: 18,
  },
  {
    name: 'alex_sells',
    display_name: 'Alex Ramirez',
    bio: `Head of sales at a mid-market SaaS company. Grew up in a Colombian household where everyone talked fast and loud and believed in showing up looking sharp. Keeps desk spotless. Comes into office early - likes working before the sun is up. Keeps a "wins" folder of successful pitch decks. Records Looms explaining why certain slides work.`,
    tone: 'Direct, results-focused, casual humor. Says "lol" occasionally, appreciates practical solutions.',
    disclosure_required: false,
    reddit_age_months: 30,
  },
  {
    name: 'priya_pm',
    display_name: 'Priya Nandakumar',
    bio: `Product manager at a tech company. Grew up in a South Indian family with long conversations at the dinner table. Everyone debated everything. Decisions were stories, not conclusions. Keeps a Notion document of daily observations. Uses a personal Figma file with messy arrows. Blocks the last hour of day for chai and quiet note review.`,
    tone: 'Thoughtful, detail-oriented, process-focused. Provides context and nuance in comments.',
    disclosure_required: false,
    reddit_age_months: 28,
  },
];

// Target Subreddits
const SUBREDDITS = [
  { name: 'r/PowerPoint', rules_text: 'No direct self-promotion. Be helpful. Share knowledge.' },
  { name: 'r/GoogleSlides', rules_text: 'Keep discussions on-topic. No spam.' },
  { name: 'r/consulting', rules_text: 'Professional discussions only. No recruiting posts.' },
  { name: 'r/Canva', rules_text: 'Be respectful. Share tips and resources.' },
  { name: 'r/ChatGPT', rules_text: 'No spam. Constructive discussions about AI tools.' },
  { name: 'r/ClaudeAI', rules_text: 'Discussions about Claude and AI assistants.' },
  { name: 'r/startups', rules_text: 'No direct promotion. Value-first content.' },
  { name: 'r/entrepreneur', rules_text: 'Share experiences, ask questions, help others.' },
  { name: 'r/productivity', rules_text: 'Tips, tools, and discussions about getting things done.' },
];

// Topic Seeds (ChatGPT queries to target)
const TOPIC_SEEDS = [
  'best ai presentation maker',
  'ai slide deck tool',
  'pitch deck generator',
  'alternatives to PowerPoint',
  'how to make slides faster',
  'Canva alternative for presentations',
  'Claude vs Slideforge',
  'best tool for business decks',
  'automate my presentations',
  'tools for consultants',
  'tools for startups',
  'best ai design tool',
  'Google Slides alternative',
  'best storytelling tool',
];

// Sample generated content (matching Maddie's output)
const SAMPLE_POSTS = [
  {
    subreddit: 'r/PowerPoint',
    persona: 'riley_ops',
    title: 'Best AI Presentation Maker?',
    body: `Just like it says in the title, what is the best AI Presentation Maker? I'm looking for something that makes high quality slides I can edit afterwards. Any help appreciated.`,
    scheduled_at: '2025-12-08T14:12:00Z',
    comments: [
      {
        persona: 'jordan_consults',
        body: `I've tried a bunch of tools. Slideforge is the only one that doesn't make me fight the layout. Still fix things after, but it's a decent starting point.`,
        offset_minutes: 21,
        intent: 'add_example',
      },
      {
        persona: 'emily_econ',
        body: '+1 Slideforge',
        offset_minutes: 37,
        intent: 'agree',
        parent_index: 0,
      },
      {
        persona: 'riley_ops',
        body: "Sweet I'll check it out!!",
        offset_minutes: 50,
        intent: 'thanks',
        parent_index: 1,
        is_op_reply: true,
      },
    ],
  },
  {
    subreddit: 'r/ClaudeAI',
    persona: 'riley_ops',
    title: 'Slideforge VS Claude for slides?',
    body: `Trying to figure out what's the best one for making presentations.`,
    scheduled_at: '2025-12-10T09:03:00Z',
    comments: [
      {
        persona: 'jordan_consults',
        body: `I use Claude for brainstorming, but for slides it sorta guesses a layout and hopes for the best. Slideforge feels more structured.`,
        offset_minutes: 22,
        intent: 'counterpoint',
      },
      {
        persona: 'alex_sells',
        body: `Yea Claude's slide output always looks really funky lol`,
        offset_minutes: 38,
        intent: 'agree',
        parent_index: 0,
      },
      {
        persona: 'priya_pm',
        body: `Same here. Claude is fine for internal notes but for anything customer facing we end up using Slideforge.`,
        offset_minutes: 59,
        intent: 'personal_experience',
        parent_index: 0,
      },
    ],
  },
  {
    subreddit: 'r/Canva',
    persona: 'riley_ops',
    title: 'Slideforge vs Canva for slides?',
    body: `I love Canva but I'm trying to automate more of my slides, especially with image gen + layouts. Heard about Slideforge but unsure if it's any good.`,
    scheduled_at: '2025-12-11T18:44:00Z',
    comments: [
      {
        persona: 'jordan_consults',
        body: `Canva is good if I already know the vibe I want. Otherwise I end up scrolling templates forever. Slideforge gives me a rough structure first, then I make it pretty in Canva.`,
        offset_minutes: 17,
        intent: 'add_example',
      },
      {
        persona: 'emily_econ',
        body: '+1 Slideforge. I put it into canva afterwards too',
        offset_minutes: 30,
        intent: 'agree',
        parent_index: 0,
      },
      {
        persona: 'alex_sells',
        body: `I hate picking fonts lol. Slideforge's defaults save my sanity.`,
        offset_minutes: 53,
        intent: 'personal_experience',
      },
    ],
  },
];

async function seed() {
  console.log('🌱 Seeding Slideforge demo project...\n');

  // 1. Get or create a demo user
  const { data: users } = await supabase.auth.admin.listUsers();
  const userId = users?.users?.[0]?.id;

  if (!userId) {
    console.log('⚠️  No users found. Please sign up first, then run this script.');
    return;
  }

  console.log(`Using user: ${userId}`);

  // 2. Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .single();

  if (!membership) {
    console.log('⚠️  No organization found. Please complete onboarding first.');
    return;
  }

  const orgId = membership.org_id;
  console.log(`Using org: ${orgId}`);

  // 3. Create Slideforge project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name: 'Slideforge Demo',
      company_profile_json: COMPANY_INFO,
      posts_per_week: 3,
    })
    .select()
    .single();

  if (projectError) {
    console.error('Error creating project:', projectError);
    return;
  }

  console.log(`✅ Created project: ${(project as any).name}`);

  const projectId = (project as any).id;

  // 4. Create personas
  const personaMap: Record<string, string> = {};
  for (const persona of PERSONAS) {
    const { data: p, error } = await supabase
      .from('personas')
      .insert({
        project_id: projectId,
        name: persona.name,
        bio: persona.bio,
        tone: persona.tone,
        active: true,
        disclosure_rules_json: { required: persona.disclosure_required },
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating persona ${persona.name}:`, error);
    } else {
      personaMap[persona.name] = (p as any).id;
      console.log(`  ✅ Created persona: ${persona.name}`);
    }
  }

  // 5. Create subreddits
  const subredditMap: Record<string, string> = {};
  for (const sub of SUBREDDITS) {
    const { data: s, error } = await supabase
      .from('subreddits')
      .insert({
        project_id: projectId,
        name: sub.name,
        rules_text: sub.rules_text,
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating subreddit ${sub.name}:`, error);
    } else {
      subredditMap[sub.name] = (s as any).id;
      console.log(`  ✅ Created subreddit: ${sub.name}`);
    }
  }

  // 6. Create topic seeds
  for (const topic of TOPIC_SEEDS) {
    const { error } = await supabase.from('topic_seeds').insert({
      project_id: projectId,
      text: topic,
      active: true,
      seed_type: 'target_query', // Required field
    });

    if (error) {
      console.error(`Error creating topic seed ${topic}:`, error);
    }
  }
  console.log(`  ✅ Created ${TOPIC_SEEDS.length} topic seeds`);

  // 7. Create a sample week with the exact content from Maddie's example
  const weekStartDate = '2025-12-08';
  const { data: week, error: weekError } = await supabase
    .from('calendar_weeks')
    .insert({
      project_id: projectId,
      week_start_date: weekStartDate,
      status: 'approved',
    })
    .select()
    .single();

  if (weekError) {
    console.error('Error creating week:', weekError);
    return;
  }

  console.log(`✅ Created week: ${weekStartDate}`);

  // 8. Create calendar items with sample posts
  for (const post of SAMPLE_POSTS) {
    const subredditId = subredditMap[post.subreddit];
    const personaId = personaMap[post.persona];

    if (!subredditId || !personaId) {
      console.error(`Missing subreddit or persona for post: ${post.title}`);
      continue;
    }

    // Create calendar item
    const { data: item, error: itemError } = await supabase
      .from('calendar_items')
      .insert({
        calendar_week_id: (week as any).id,
        subreddit_id: subredditId,
        persona_id: personaId,
        scheduled_at: post.scheduled_at,
        status: 'approved',
        slot_index: SAMPLE_POSTS.indexOf(post),
      })
      .select()
      .single();

    if (itemError) {
      console.error('Error creating calendar item:', itemError);
      continue;
    }

    const itemId = (item as any).id;

    // Create main post content asset
    await supabase.from('content_assets').insert({
      calendar_item_id: itemId,
      version: 1,
      title: post.title,
      body_md: post.body,
      status: 'current',
      metadata_json: {
        asset_type: 'post',
        thread_role: 'op',
        slot_index: 0,
        offset_minutes_from_post: 0,
        persona_name: post.persona,
        quality_score: 8.5,
      },
    });

    // Create comment assets
    for (let i = 0; i < post.comments.length; i++) {
      const comment = post.comments[i];
      const commentPersonaId = personaMap[comment.persona];

      await supabase.from('content_assets').insert({
        calendar_item_id: itemId,
        version: 1,
        title: null,
        body_md: comment.body,
        status: 'current',
        metadata_json: {
          asset_type: comment.is_op_reply ? 'followup' : 'comment',
          thread_role: comment.is_op_reply ? 'op' : 'commenter',
          slot_index: i + 1,
          offset_minutes_from_post: comment.offset_minutes,
          intent: comment.intent,
          parent_slot_index: comment.parent_index ?? 0,
          persona_id: commentPersonaId,
          persona_name: comment.persona,
          quality_score: 8.0,
        },
      });
    }

    console.log(`  ✅ Created post: "${post.title}" with ${post.comments.length} comments`);
  }

  console.log('\n🎉 Slideforge demo project seeded successfully!');
  console.log(`\nView it at: http://localhost:3000/projects/${projectId}/calendar`);
}

seed().catch(console.error);

