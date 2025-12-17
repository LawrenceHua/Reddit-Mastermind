'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, XCircle, Clock, ArrowRight, RefreshCw } from 'lucide-react';

interface RunData {
  id: string;
  run_type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  inputs_json: {
    week_start_date?: string;
    posts_per_week?: number;
  };
  calendar_week?: {
    id: string;
    week_start_date: string;
  };
  projects: {
    name: string;
  };
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Pending',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Running',
  },
  succeeded: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Succeeded',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Failed',
  },
};

export default function RunPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string }>;
}) {
  const { projectId, runId } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll for run status
  useEffect(() => {
    async function fetchRun() {
      try {
        const response = await fetch(`/api/runs/${runId}`);
        const data = await response.json();

        if (response.ok) {
          setRun(data);
        }
      } catch (error) {
        console.error('Failed to fetch run:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRun();

    // Poll every 2 seconds while running
    const interval = setInterval(() => {
      if (run?.status === 'pending' || run?.status === 'running') {
        fetchRun();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runId, run?.status]);

  if (loading) {
    return (
      <AppShell title="Generation Run" projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell title="Generation Run" projectId={projectId}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-zinc-500">Run not found</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const config = STATUS_CONFIG[run.status];
  const StatusIcon = config.icon;
  const isComplete = run.status === 'succeeded' || run.status === 'failed';

  return (
    <AppShell title="Generation Run" projectId={projectId}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Content Generation</CardTitle>
                <CardDescription>
                  {run.run_type === 'week_gen' ? 'Generating weekly content' : 'Regenerating item'}
                </CardDescription>
              </div>
              <Badge className={`${config.bgColor} ${config.color}`}>{config.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Display */}
            <div className="flex flex-col items-center py-8">
              <div className={`p-4 rounded-full ${config.bgColor} mb-4`}>
                <StatusIcon
                  className={`h-8 w-8 ${config.color} ${run.status === 'running' ? 'animate-spin' : ''}`}
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">{config.label}</h3>
              {run.status === 'running' && (
                <p className="text-zinc-500">This may take a few minutes...</p>
              )}
              {run.status === 'succeeded' && (
                <p className="text-zinc-500">Content has been generated successfully</p>
              )}
              {run.status === 'failed' && (
                <p className="text-red-500">{run.error || 'An error occurred'}</p>
              )}
            </div>

            {/* Progress Bar (simulated for running) */}
            {run.status === 'running' && <Progress value={50} className="animate-pulse" />}

            {/* Details */}
            <div className="space-y-2 text-sm">
              {run.inputs_json.week_start_date && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Week Start</span>
                  <span>{run.inputs_json.week_start_date}</span>
                </div>
              )}
              {run.inputs_json.posts_per_week && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Posts per Week</span>
                  <span>{run.inputs_json.posts_per_week}</span>
                </div>
              )}
              {run.started_at && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Started</span>
                  <span>{new Date(run.started_at).toLocaleString()}</span>
                </div>
              )}
              {run.finished_at && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Finished</span>
                  <span>{new Date(run.finished_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {isComplete && (
              <div className="flex gap-3 pt-4">
                {run.status === 'succeeded' && run.calendar_week && (
                  <Button
                    className="flex-1"
                    onClick={() =>
                      router.push(`/projects/${projectId}/weeks/${run.calendar_week!.id}`)
                    }
                  >
                    View Generated Content
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
                {run.status === 'failed' && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push(`/projects/${projectId}/calendar`)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}/calendar`)}
                >
                  Back to Calendar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
