'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface GenerationRun {
  id: string;
  run_type: string;
  status: string;
  created_at: string;
  inputs_json: {
    week_start_date?: string;
    posts_per_week?: number;
  };
  outputs_json?: {
    items_created?: number;
    error?: string;
  };
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-500 bg-yellow-500/10', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500 bg-blue-500/10', label: 'Running' },
  completed: { icon: CheckCircle, color: 'text-green-500 bg-green-500/10', label: 'Completed' },
  succeeded: { icon: CheckCircle, color: 'text-green-500 bg-green-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500 bg-red-500/10', label: 'Failed' },
};

export default function RunsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<GenerationRun[]>([]);

  useEffect(() => {
    async function loadRuns() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('generation_runs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRuns(data as GenerationRun[]);
      }
      setLoading(false);
    }

    loadRuns();
  }, [projectId]);

  if (loading) {
    return (
      <AppShell title="Generation Runs" projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Generation Runs" projectId={projectId}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Generation History</CardTitle>
            <CardDescription>All content generation runs for this project</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No generation runs yet. Go to Calendar to generate content.
              </div>
            ) : (
              <div className="space-y-3">
                {runs.map((run) => {
                  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
                  const StatusIcon = config.icon;

                  return (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/projects/${projectId}/runs/${run.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${config.color}`}>
                          <StatusIcon
                            className={`h-4 w-4 ${run.status === 'running' ? 'animate-spin' : ''}`}
                          />
                        </div>
                        <div>
                          <div className="font-medium">
                            {run.run_type === 'week_gen' ? 'Week Generation' : 'Item Regeneration'}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {run.inputs_json?.week_start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Week of {run.inputs_json.week_start_date}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {run.outputs_json?.items_created && (
                          <span className="text-sm text-zinc-500">
                            {run.outputs_json.items_created} items
                          </span>
                        )}
                        <Badge className={config.color}>{config.label}</Badge>
                        <span className="text-sm text-zinc-400">
                          {format(new Date(run.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

