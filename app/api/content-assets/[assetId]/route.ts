import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

const UpdateAssetSchema = z.object({
  title: z.string().optional(),
  body_md: z.string().optional(),
});

// Get asset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: asset, error } = await supabase
      .from('content_assets')
      .select('*, quality_scores(*)')
      .eq('id', assetId)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Update asset (creates new version)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedBody = UpdateAssetSchema.parse(body);

    // Get current asset
    const { data: currentAsset, error: fetchError } = await supabase
      .from('content_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (fetchError || !currentAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Archive current version
    await supabase.from('content_assets').update({ status: 'archived' }).eq('id', assetId);

    // Create new version
    const adminClient = createAdminClient();
    const { data: newAsset, error: createError } = await adminClient
      .from('content_assets')
      .insert({
        calendar_item_id: currentAsset.calendar_item_id,
        asset_type: currentAsset.asset_type,
        author_persona_id: currentAsset.author_persona_id,
        title: validatedBody.title ?? currentAsset.title,
        body_md: validatedBody.body_md ?? currentAsset.body_md,
        metadata_json: currentAsset.metadata_json,
        version: currentAsset.version + 1,
        status: 'active',
      })
      .select()
      .single();

    if (createError || !newAsset) {
      return NextResponse.json({ error: 'Failed to create new version' }, { status: 500 });
    }

    // Get org_id for audit log
    const { data: itemData } = await supabase
      .from('calendar_items')
      .select('calendar_weeks(projects(org_id, id))')
      .eq('id', currentAsset.calendar_item_id)
      .single();

    const projectInfo = (
      itemData?.calendar_weeks as unknown as { projects: { org_id: string; id: string } }
    )?.projects;

    if (projectInfo) {
      await writeAuditLog({
        orgId: projectInfo.org_id,
        projectId: projectInfo.id,
        actorUserId: user.id,
        action: 'update',
        entityType: 'content_asset',
        entityId: newAsset.id,
        diff: {
          previousVersion: currentAsset.version,
          newVersion: newAsset.version,
          changes: validatedBody,
        },
      });
    }

    return NextResponse.json(newAsset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
