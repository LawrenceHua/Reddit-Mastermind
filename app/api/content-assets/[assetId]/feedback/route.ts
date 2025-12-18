import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { z } from 'zod';

const FeedbackSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  feedback: z.string().max(1000).optional(),
  wasPosted: z.boolean().optional(),
  redditScore: z.number().optional(),
  redditUrl: z.string().url().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validatedBody = FeedbackSchema.parse(body);

    // Get asset and verify access
    const { data: asset, error: assetError } = await supabase
      .from('content_assets')
      .select(`
        id,
        user_rating,
        was_posted,
        calendar_items!inner(
          calendar_weeks!inner(
            projects!inner(id, org_id)
          )
        )
      `)
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      feedback_at: new Date().toISOString(),
    };

    if (validatedBody.rating !== undefined) {
      updateData.user_rating = validatedBody.rating;
    }
    if (validatedBody.feedback !== undefined) {
      updateData.user_feedback = validatedBody.feedback;
    }
    if (validatedBody.wasPosted !== undefined) {
      updateData.was_posted = validatedBody.wasPosted;
      if (validatedBody.wasPosted) {
        updateData.posted_at = new Date().toISOString();
      }
    }
    if (validatedBody.redditScore !== undefined) {
      updateData.reddit_score = validatedBody.redditScore;
    }
    if (validatedBody.redditUrl !== undefined) {
      updateData.reddit_url = validatedBody.redditUrl;
    }

    // Update asset
    const { error: updateError } = await (supabase
      .from('content_assets') as any)
      .update(updateData)
      .eq('id', assetId);

    if (updateError) {
      console.error('Error updating feedback:', updateError);
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500 }
      );
    }

    // Get project info for audit log
    const projectInfo = (asset as any).calendar_items?.calendar_weeks?.projects;

    if (projectInfo) {
      await writeAuditLog({
        orgId: projectInfo.org_id,
        projectId: projectInfo.id,
        actorUserId: user.id,
        action: 'feedback',
        entityType: 'content_asset',
        entityId: assetId,
        diff: {
          rating: validatedBody.rating,
          wasPosted: validatedBody.wasPosted,
          redditScore: validatedBody.redditScore,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback saved',
    });
  } catch (error) {
    console.error('Error saving feedback:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve feedback stats for a project
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
      .select('user_rating, user_feedback, was_posted, reddit_score, reddit_url, posted_at, feedback_at')
      .eq('id', assetId)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

