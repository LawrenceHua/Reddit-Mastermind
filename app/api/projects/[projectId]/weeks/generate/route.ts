import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueJob } from '@/lib/jobs';
import { startOfWeek, addWeeks } from 'date-fns';
import { z } from 'zod';

const GenerateWeekSchema = z.object({
  week_start_date: z.string().optional(),
  posts_per_week: z.number().min(1).max(20).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get project and verify access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, orgs(*)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const validatedBody = GenerateWeekSchema.parse(body);

    // Determine week start date
    let weekStartDate: Date;
    if (validatedBody.week_start_date) {
      weekStartDate = new Date(validatedBody.week_start_date);
    } else {
      // Default to next Monday
      const today = new Date();
      weekStartDate = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
    }

    const postsPerWeek = validatedBody.posts_per_week ?? project.posts_per_week;

    // Check if week already exists
    const weekStartStr = weekStartDate.toISOString().split('T')[0];
    const { data: existingWeek } = await supabase
      .from('calendar_weeks')
      .select('id')
      .eq('project_id', projectId)
      .eq('week_start_date', weekStartStr)
      .single();

    let calendarWeekId: string;

    if (existingWeek) {
      calendarWeekId = existingWeek.id;
    } else {
      // Create new calendar week
      const { data: newWeek, error: weekError } = await supabase
        .from('calendar_weeks')
        .insert({
          project_id: projectId,
          week_start_date: weekStartStr,
          status: 'draft',
        })
        .select('id')
        .single();

      if (weekError || !newWeek) {
        return NextResponse.json({ error: 'Failed to create calendar week' }, { status: 500 });
      }

      calendarWeekId = newWeek.id;
    }

    // Create generation run
    const { data: run, error: runError } = await supabase
      .from('generation_runs')
      .insert({
        project_id: projectId,
        run_type: 'week_gen',
        inputs_json: {
          week_start_date: weekStartStr,
          posts_per_week: postsPerWeek,
        },
        model_config_json: {
          model: 'gpt-4o',
          temperature: 0.7,
          candidates_per_slot: 3,
        },
        status: 'pending',
      })
      .select('id')
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Failed to create generation run' }, { status: 500 });
    }

    // Update calendar week with generation run id
    await supabase
      .from('calendar_weeks')
      .update({ generation_run_id: run.id })
      .eq('id', calendarWeekId);

    // Enqueue job
    await enqueueJob(project.org_id, projectId, 'generate_week', {
      week_start_date: weekStartStr,
      calendar_week_id: calendarWeekId,
      generation_run_id: run.id,
      posts_per_week: postsPerWeek,
    });

    return NextResponse.json({
      generation_run_id: run.id,
      calendar_week_id: calendarWeekId,
      week_start_date: weekStartStr,
    });
  } catch (error) {
    console.error('Error in generate week:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
