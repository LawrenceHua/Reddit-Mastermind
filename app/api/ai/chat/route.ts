import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema),
  project_id: z.string().uuid().optional(),
  context: z.object({
    current_page: z.string().optional(),
    company_info: z.any().optional(),
    personas: z.array(z.any()).optional(),
    subreddits: z.array(z.any()).optional(),
    topic_seeds: z.array(z.any()).optional(),
  }).optional(),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Define available functions the agent can call
const AVAILABLE_FUNCTIONS = [
  {
    name: 'scrape_company_website',
    description: 'Scrape a company website to extract company information like name, description, industry, and target audience',
    parameters: {
      type: 'object',
      properties: {
        website_url: {
          type: 'string',
          description: 'The full URL of the website to scrape (e.g., https://example.com)',
        },
      },
      required: ['website_url'],
    },
  },
  {
    name: 'generate_personas',
    description: 'Generate AI-suggested personas for Reddit content marketing based on company information',
    parameters: {
      type: 'object',
      properties: {
        num_personas: {
          type: 'number',
          description: 'Number of personas to generate (1-5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'suggest_subreddits',
    description: 'Suggest relevant subreddits for the company to target, verified against Reddit API',
    parameters: {
      type: 'object',
      properties: {
        num_subreddits: {
          type: 'number',
          description: 'Number of subreddits to suggest (1-10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'suggest_topics',
    description: 'Generate topic seed suggestions for content creation',
    parameters: {
      type: 'object',
      properties: {
        num_topics: {
          type: 'number',
          description: 'Number of topics to generate (1-20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'save_company_info',
    description: 'Save company information to the current project',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Company name' },
        description: { type: 'string', description: 'Company description' },
        website: { type: 'string', description: 'Company website URL' },
        industry: { type: 'string', description: 'Industry' },
        target_audience: { type: 'string', description: 'Target audience' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'add_persona',
    description: 'Add a new persona to the current project',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Persona name' },
        bio: { type: 'string', description: 'Persona bio/backstory' },
        tone: { type: 'string', description: 'Communication tone' },
        expertise_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas of expertise',
        },
        disclosure_required: {
          type: 'boolean',
          description: 'Whether this persona requires disclosure',
        },
      },
      required: ['name', 'bio', 'tone'],
    },
  },
  {
    name: 'add_subreddit',
    description: 'Add a subreddit to target in the current project',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Subreddit name (e.g., r/startups)' },
        risk_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk level for posting',
        },
        max_posts_per_week: {
          type: 'number',
          description: 'Maximum posts per week',
        },
        rules_text: { type: 'string', description: 'Key rules to follow' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_topic_seed',
    description: 'Add a topic seed for content generation',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['target_query', 'pain_point', 'competitor', 'faq'],
          description: 'Type of topic seed',
        },
        value: { type: 'string', description: 'The topic/query text' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relevant tags',
        },
      },
      required: ['type', 'value'],
    },
  },
  {
    name: 'navigate_to',
    description: 'Navigate to a different page in the app',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: ['dashboard', 'projects', 'setup', 'calendar', 'analytics'],
          description: 'Page to navigate to',
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'generate_week',
    description: 'Generate a content calendar for the upcoming week',
    parameters: {
      type: 'object',
      properties: {
        posts_per_week: {
          type: 'number',
          description: 'Number of posts to generate',
        },
      },
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI assistant for Reddit Mastermind, a content operations platform for planning ethical Reddit marketing campaigns.

Your capabilities:
1. Help users set up their projects (company info, personas, subreddits, topics)
2. Use AI to scrape websites and suggest content
3. Generate personas, find subreddits, and create topic ideas
4. Navigate users to different parts of the app
5. Save data to their projects

When users ask you to do something, use the available functions to accomplish it. Be proactive in suggesting next steps.

Guidelines:
- Always be helpful and clear
- When generating content, emphasize ethical marketing (no manipulation, authentic engagement)
- If you need information to complete a task, ask for it
- Provide brief explanations of what you're doing

Current context will be provided with each message so you know what page the user is on and what data exists.`;

async function executeFunction(
  functionName: string,
  args: Record<string, any>,
  context: any,
  projectId: string | undefined,
  supabase: any
): Promise<{ result: any; action?: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  switch (functionName) {
    case 'scrape_company_website': {
      const response = await fetch(`${baseUrl}/api/ai/scrape-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: args.website_url }),
      });
      const data = await response.json();
      return { result: data };
    }

    case 'generate_personas': {
      if (!context?.company_info?.name) {
        return { result: { error: 'No company information available. Please add company info first.' } };
      }
      const response = await fetch(`${baseUrl}/api/ai/suggest-personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: context.company_info.name,
          company_description: context.company_info.description,
          industry: context.company_info.industry || 'Technology',
          target_audience: context.company_info.target_audience || 'Business professionals',
          brand_voice: context.company_info.brand_voice,
          num_personas: args.num_personas || 3,
        }),
      });
      const data = await response.json();
      return { result: data };
    }

    case 'suggest_subreddits': {
      if (!context?.company_info?.name) {
        return { result: { error: 'No company information available. Please add company info first.' } };
      }
      const response = await fetch(`${baseUrl}/api/ai/suggest-subreddits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: context.company_info.name,
          company_description: context.company_info.description,
          industry: context.company_info.industry || 'Technology',
          target_audience: context.company_info.target_audience || 'Business professionals',
          num_subreddits: args.num_subreddits || 5,
        }),
      });
      const data = await response.json();
      return { result: data };
    }

    case 'suggest_topics': {
      if (!context?.company_info?.name) {
        return { result: { error: 'No company information available. Please add company info first.' } };
      }
      const response = await fetch(`${baseUrl}/api/ai/suggest-topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: context.company_info.name,
          company_description: context.company_info.description,
          industry: context.company_info.industry || 'Technology',
          target_audience: context.company_info.target_audience || 'Business professionals',
          key_benefits: context.company_info.key_benefits,
          subreddits: context.subreddits?.map((s: any) => s.name),
          num_topics: args.num_topics || 10,
        }),
      });
      const data = await response.json();
      return { result: data };
    }

    case 'save_company_info': {
      if (!projectId) {
        return { result: { error: 'No project selected' } };
      }
      const { error } = await supabase
        .from('projects')
        .update({
          company_profile_json: {
            name: args.name,
            description: args.description,
            website: args.website,
            industry: args.industry,
            target_audience: args.target_audience,
          },
        })
        .eq('id', projectId);
      
      if (error) {
        return { result: { error: error.message } };
      }
      return { 
        result: { success: true, message: 'Company info saved!' },
        action: 'refresh_company_info',
      };
    }

    case 'add_persona': {
      if (!projectId) {
        return { result: { error: 'No project selected' } };
      }
      const { data, error } = await supabase
        .from('personas')
        .insert({
          project_id: projectId,
          name: args.name,
          bio: args.bio,
          tone: args.tone,
          expertise_tags: args.expertise_tags || [],
          disclosure_rules_json: { required: args.disclosure_required || false },
          active: true,
        })
        .select()
        .single();
      
      if (error) {
        return { result: { error: error.message } };
      }
      return { 
        result: { success: true, persona: data },
        action: 'refresh_personas',
      };
    }

    case 'add_subreddit': {
      if (!projectId) {
        return { result: { error: 'No project selected' } };
      }
      const { data, error } = await supabase
        .from('subreddits')
        .insert({
          project_id: projectId,
          name: args.name.startsWith('r/') ? args.name : `r/${args.name}`,
          risk_level: args.risk_level || 'medium',
          max_posts_per_week: args.max_posts_per_week || 2,
          rules_text: args.rules_text || '',
          allowed_post_types_json: ['text'],
        })
        .select()
        .single();
      
      if (error) {
        return { result: { error: error.message } };
      }
      return { 
        result: { success: true, subreddit: data },
        action: 'refresh_subreddits',
      };
    }

    case 'add_topic_seed': {
      if (!projectId) {
        return { result: { error: 'No project selected' } };
      }
      const { data, error } = await supabase
        .from('topic_seeds')
        .insert({
          project_id: projectId,
          seed_type: args.type,
          text: args.value,
          tags: args.tags || [],
          active: true,
        })
        .select()
        .single();
      
      if (error) {
        return { result: { error: error.message } };
      }
      return { 
        result: { success: true, topic_seed: data },
        action: 'refresh_topics',
      };
    }

    case 'navigate_to': {
      let path = '/dashboard';
      if (args.page === 'projects') path = '/projects';
      else if (args.page === 'setup' && projectId) path = `/projects/${projectId}/setup`;
      else if (args.page === 'calendar' && projectId) path = `/projects/${projectId}/calendar`;
      else if (args.page === 'analytics' && projectId) path = `/projects/${projectId}/analytics`;
      
      return { 
        result: { success: true, path },
        action: 'navigate',
      };
    }

    case 'generate_week': {
      if (!projectId) {
        return { result: { error: 'No project selected' } };
      }
      // For now, just return instructions since this involves the job queue
      return { 
        result: { 
          success: true, 
          message: 'To generate a content calendar, please go to the Calendar page and click "Generate Week".',
        },
        action: 'navigate_to_calendar',
      };
    }

    default:
      return { result: { error: `Unknown function: ${functionName}` } };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Parse request
    const body = await request.json();
    const { messages, project_id, context } = RequestSchema.parse(body);

    // Build context message
    const contextMessage = context ? `
Current context:
- Page: ${context.current_page || 'Unknown'}
- Project ID: ${project_id || 'None selected'}
- Company Info: ${context.company_info ? JSON.stringify(context.company_info) : 'Not set'}
- Personas: ${context.personas?.length || 0} defined
- Subreddits: ${context.subreddits?.length || 0} defined
- Topic Seeds: ${context.topic_seeds?.length || 0} defined
` : '';

    // Call OpenAI with function calling
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + contextMessage },
          ...messages,
        ],
        functions: AVAILABLE_FUNCTIONS,
        function_call: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    // If the model wants to call a function
    if (choice.finish_reason === 'function_call' && choice.message.function_call) {
      const functionCall = choice.message.function_call;
      const functionArgs = JSON.parse(functionCall.arguments);

      // Execute the function
      const { result, action } = await executeFunction(
        functionCall.name,
        functionArgs,
        context,
        project_id,
        supabase
      );

      // Get a follow-up response from the model with the function result
      const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + contextMessage },
            ...messages,
            choice.message,
            {
              role: 'function',
              name: functionCall.name,
              content: JSON.stringify(result),
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!followUpResponse.ok) {
        throw new Error('Failed to get follow-up response');
      }

      const followUpData = await followUpResponse.json();

      return NextResponse.json({
        success: true,
        message: followUpData.choices[0].message.content,
        function_called: functionCall.name,
        function_result: result,
        action,
      });
    }

    // Regular response (no function call)
    return NextResponse.json({
      success: true,
      message: choice.message.content,
    });
  } catch (error) {
    console.error('Error in chat:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

