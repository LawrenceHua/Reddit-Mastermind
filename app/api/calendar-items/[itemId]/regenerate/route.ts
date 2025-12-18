import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueJob } from '@/lib/jobs';

interface CalendarItemWithWeek {
  id: string;
  calendar_week_id: string;
  calendar_weeks: {
    project_id: string;
    projects: { org_id: string };
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get calendar item with project info
    const { data: item, error } = await supabase
      .from('calendar_items')
      .select(
        `
        id,
        calendar_week_id,
        calendar_weeks(
          project_id,
          projects(org_id)
        )
      `
      )
      .eq('id', itemId)
      .single<CalendarItemWithWeek>();

    if (error || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const weekData = item.calendar_weeks;

    // Create generation run
    const { data: run, error: runError } = await supabase
      .from('generation_runs')
      .insert({
        project_id: weekData.project_id,
        run_type: 'regen_item',
        inputs_json: { calendar_item_id: itemId },
        model_config_json: { model: 'gpt-4o', temperature: 0.7 },
        status: 'pending',
      } as any) // Type assertion needed due to Supabase type inference issue
      .select('id')
      .single() as { data: { id: string } | null; error: any };

    if (runError || !run || !run.id) {
      return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
    }

    // Enqueue job
    await enqueueJob(weekData.projects.org_id, weekData.project_id, 'generate_item', {
      calendar_item_id: itemId,
      generation_run_id: run.id,
    });

    return NextResponse.json({ generation_run_id: run.id });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
