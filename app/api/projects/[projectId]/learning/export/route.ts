import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportTrainingData, validateTrainingData, assessFineTuningReadiness } from '@/lib/learning';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project access
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, org_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check readiness
    const readiness = await assessFineTuningReadiness(projectId);
    
    if (!readiness.ready) {
      return NextResponse.json({
        error: 'Not enough training data',
        details: readiness.recommendations,
        progress: {
          current: readiness.totalExamples,
          required: readiness.minRequired,
        },
      }, { status: 400 });
    }

    // Export training data
    const { jsonl, count } = await exportTrainingData(projectId, {
      minRating: 4,
      onlyPosted: true,
      limit: 500,
    });

    if (count === 0) {
      return NextResponse.json({
        error: 'No training data available',
        details: ['No content matches the export criteria (4+ stars, posted)'],
      }, { status: 400 });
    }

    // Validate
    const validation = validateTrainingData(jsonl);

    if (!validation.valid) {
      return NextResponse.json({
        error: 'Training data validation failed',
        details: validation.errors,
      }, { status: 400 });
    }

    // Return as downloadable file
    return new NextResponse(jsonl, {
      status: 200,
      headers: {
        'Content-Type': 'application/jsonl',
        'Content-Disposition': `attachment; filename="training-data-${projectId.slice(0, 8)}.jsonl"`,
      },
    });
  } catch (error) {
    console.error('Error exporting training data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check export status/readiness
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const readiness = await assessFineTuningReadiness(projectId);

    return NextResponse.json({
      ready: readiness.ready,
      progress: {
        current: readiness.totalExamples,
        required: readiness.minRequired,
        percentage: Math.min(100, (readiness.totalExamples / readiness.minRequired) * 100),
      },
      qualityBreakdown: readiness.qualityBreakdown,
      recommendations: readiness.recommendations,
    });
  } catch (error) {
    console.error('Error checking export readiness:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

