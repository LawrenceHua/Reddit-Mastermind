import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueJob } from '@/lib/jobs';
import { writeAuditLog } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> }
) {
  try {
    const { weekId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get week with items
    const { data: week, error } = await supabase
      .from('calendar_weeks')
      .select(
        `
        *,
        projects(id, org_id),
        calendar_items(
          id,
          scheduled_at,
          content_assets(id, status)
        )
      `
      )
      .eq('id', weekId)
      .single();

    if (error || !week) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 });
    }

    if (week.status !== 'approved') {
      return NextResponse.json(
        { error: 'Week must be approved before scheduling' },
        { status: 400 }
      );
    }

    const projectData = week.projects as unknown as { id: string; org_id: string };
    const items = week.calendar_items as unknown as Array<{
      id: string;
      scheduled_at: string;
      content_assets: Array<{ id: string; status: string }>;
    }>;

    // Create publish jobs for each item
    for (const item of items) {
      const activeAsset = item.content_assets?.find((a) => a.status === 'active');

      if (activeAsset) {
        await enqueueJob(
          projectData.org_id,
          projectData.id,
          'publish_item',
          {
            calendar_item_id: item.id,
            content_asset_id: activeAsset.id,
          },
          new Date(item.scheduled_at)
        );
      }

      // Update item status
      await supabase.from('calendar_items').update({ status: 'scheduled' }).eq('id', item.id);
    }

    // Update week status
    await supabase.from('calendar_weeks').update({ status: 'scheduled' }).eq('id', weekId);

    // Write audit log
    await writeAuditLog({
      orgId: projectData.org_id,
      projectId: projectData.id,
      actorUserId: user.id,
      action: 'schedule',
      entityType: 'calendar_week',
      entityId: weekId,
      diff: { items_scheduled: items.length },
    });

    return NextResponse.json({
      status: 'scheduled',
      jobs_created: items.length,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
