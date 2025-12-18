/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> }
) {
  try {
    const { weekId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get calendar week with items
    const { data: week, error } = await supabase
      .from('calendar_weeks')
      .select(
        `
        *,
        projects!inner(
          id,
          name,
          org_id
        ),
        generation_runs(
          id,
          status,
          started_at,
          finished_at,
          error
        ),
        calendar_items(
          *,
          subreddits(id, name, risk_level),
          personas(id, name, tone),
          content_assets(
            *,
            quality_scores(*)
          )
        )
      `
      )
      .eq('id', weekId)
      .single();

    if (error || !week) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 });
    }

    return NextResponse.json(week);
  } catch (error) {
    console.error('Error fetching week:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> }
) {
  try {
    const { weekId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Only allow updating status
    if (body.status && !['draft', 'approved', 'scheduled', 'published'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data: week, error } = await (supabase
      .from('calendar_weeks') as any)
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', weekId)
      .select()
      .single();

    if (error || !week) {
      return NextResponse.json({ error: 'Failed to update week' }, { status: 500 });
    }

    return NextResponse.json(week);
  } catch (error) {
    console.error('Error updating week:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
