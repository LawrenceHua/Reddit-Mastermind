/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get generation run with project info
    const { data: run, error } = await supabase
      .from('generation_runs')
      .select(
        `
        *,
        projects!inner(
          id,
          name,
          org_id
        )
      `
      )
      .eq('id', runId)
      .single();

    if (error || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Get associated calendar week if any
    const { data: week } = await supabase
      .from('calendar_weeks')
      .select('id, week_start_date, status')
      .eq('generation_run_id', runId)
      .single();

    // Get job status if running
    let jobInfo = null;
    if ((run as any).status === 'pending' || (run as any).status === 'running') {
      const { data: job } = await supabase
        .from('jobs')
        .select('status, attempts, last_error, created_at')
        .eq('payload_json->generation_run_id', runId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      jobInfo = job;
    }

    // Map status for UI compatibility (DB uses 'completed', UI expects 'succeeded')
    const status = (run as any).status === 'completed' ? 'succeeded' : (run as any).status;

    return NextResponse.json({
      ...(run as any),
      status,
      calendar_week: week,
      job: jobInfo,
    });
  } catch (error) {
    console.error('Error fetching run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
