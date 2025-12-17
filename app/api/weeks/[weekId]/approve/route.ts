import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { hasCriticalFlags } from '@/lib/validators';

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
        calendar_items(risk_flags_json)
      `
      )
      .eq('id', weekId)
      .single();

    if (error || !week) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 });
    }

    // Check for critical flags
    const items = week.calendar_items as unknown as Array<{ risk_flags_json: string[] }>;
    const hasCritical = items.some((item) => hasCriticalFlags(item.risk_flags_json || []));

    if (hasCritical) {
      return NextResponse.json(
        { error: 'Cannot approve week with critical flags' },
        { status: 400 }
      );
    }

    // Update week status
    const { error: updateError } = await supabase
      .from('calendar_weeks')
      .update({ status: 'approved' })
      .eq('id', weekId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve week' }, { status: 500 });
    }

    // Update all items to approved
    await supabase
      .from('calendar_items')
      .update({ status: 'approved' })
      .eq('calendar_week_id', weekId);

    const projectData = week.projects as unknown as { id: string; org_id: string };

    // Write audit log
    await writeAuditLog({
      orgId: projectData.org_id,
      projectId: projectData.id,
      actorUserId: user.id,
      action: 'approve',
      entityType: 'calendar_week',
      entityId: weekId,
      diff: { previousStatus: week.status, newStatus: 'approved' },
    });

    return NextResponse.json({ status: 'approved' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
