import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportWeekToCSV, exportWeekToJSON } from '@/lib/export';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> }
) {
  try {
    const { weekId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get week with all data
    const { data: week, error } = await supabase
      .from('calendar_weeks')
      .select('*')
      .eq('id', weekId)
      .single();

    if (error || !week) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 });
    }

    // Get calendar items separately
    const { data: items } = await supabase
      .from('calendar_items')
      .select('*')
      .eq('calendar_week_id', weekId);

    // Enrich items with related data
    const enrichedItems = await Promise.all(
      (items || []).map(async (item) => {
        const { data: subreddit } = await supabase
          .from('subreddits')
          .select('name')
          .eq('id', item.subreddit_id)
          .single();

        const { data: persona } = await supabase
          .from('personas')
          .select('name')
          .eq('id', item.primary_persona_id)
          .single();

        const { data: assets } = await supabase
          .from('content_assets')
          .select('*')
          .eq('calendar_item_id', item.id);

        return {
          id: item.id,
          scheduled_at: item.scheduled_at,
          status: item.status,
          subreddits: subreddit,
          personas: persona,
          content_assets: assets || [],
        };
      })
    );

    const weekData = {
      id: week.id,
      week_start_date: week.week_start_date,
      status: week.status,
      calendar_items: enrichedItems,
    };

    if (format === 'csv') {
      const csv = exportWeekToCSV(weekData);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="week-${week.week_start_date}.csv"`,
        },
      });
    } else {
      const json = exportWeekToJSON(weekData);
      return new NextResponse(JSON.stringify(json, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="week-${week.week_start_date}.json"`,
        },
      });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
