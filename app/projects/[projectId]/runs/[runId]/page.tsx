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
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'completed';
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

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
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
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Completed',
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
    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;
    let shouldPoll = true;

    async function fetchRun() {
      if (!shouldPoll) return;
      
      try {
        const response = await fetch(`/api/runs/${runId}`);
        const data = await response.json();

        if (response.ok && isMounted) {
          setRun(data);
          
          // Stop polling if run is complete
          const isComplete = data.status === 'succeeded' || data.status === 'failed' || data.status === 'completed';
          if (isComplete) {
            shouldPoll = false;
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            console.log('[Run] Status complete:', data.status);
          }
        }
      } catch (error) {
        console.error('Failed to fetch run:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    // Initial fetch
    fetchRun();

    // Only start polling if we don't already know the status
    pollInterval = setInterval(() => {
      if (shouldPoll) {
        fetchRun();
      }
    }, 3000);

    return () => {
      isMounted = false;
      shouldPoll = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [runId]);

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

  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isComplete = run.status === 'succeeded' || run.status === 'failed' || run.status === 'completed';

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
              {run.status === 'pending' && (
                <p className="text-zinc-500 text-center">Preparing to generate content...</p>
              )}
              {run.status === 'running' && (
                <p className="text-zinc-500 text-center">
                  Creating posts and comment threads with AI. This takes 20-30 seconds.
                </p>
              )}
              {(run.status === 'succeeded' || run.status === 'completed') && (
                <div className="text-center">
                  <p className="text-green-600 font-medium mb-1">✨ Content generated successfully!</p>
                  <p className="text-zinc-500 text-sm">
                    Click below to review, edit, and copy your posts.
                  </p>
                </div>
              )}
              {run.status === 'failed' && (
                <div className="text-center">
                  <p className="text-red-500 mb-1">{run.error || 'An error occurred during generation'}</p>
                  <p className="text-zinc-500 text-sm">Try again or check your setup configuration.</p>
                </div>
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
              <div className="space-y-4 pt-4">
                {(run.status === 'succeeded' || run.status === 'completed') && run.calendar_week && (
                  <>
                    <Button
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                      size="lg"
                      onClick={() =>
                        router.push(`/projects/${projectId}/weeks/${run.calendar_week!.id}`)
                      }
                    >
                      Review & Edit Your Content
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <p className="text-xs text-center text-zinc-500">
                      Next: Review posts, make edits, then copy to post on Reddit
                    </p>
                  </>
                )}
                {run.status === 'failed' && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => router.push(`/projects/${projectId}/calendar`)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Back to Calendar to Try Again
                    </Button>
                    <p className="text-xs text-center text-zinc-500">
                      Check your setup and try generating again
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
