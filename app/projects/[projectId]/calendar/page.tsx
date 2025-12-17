'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Eye,
} from 'lucide-react';
import { format, startOfWeek, addWeeks, subWeeks, isSameWeek } from 'date-fns';
import { toast } from 'sonner';

interface CalendarWeek {
  id: string;
  week_start_date: string;
  status: 'draft' | 'approved' | 'scheduled' | 'published';
  generation_run_id: string | null;
  calendar_items: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    subreddits: { name: string };
    personas: { name: string };
  }>;
}

const STATUS_COLORS = {
  draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  published: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

export default function CalendarPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Load weeks
  useEffect(() => {
    async function loadWeeks() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('calendar_weeks')
        .select(
          `
          *,
          calendar_items(
            id,
            scheduled_at,
            status,
            subreddits(name),
            personas:personas!calendar_items_primary_persona_id_fkey(name)
          )
        `
        )
        .eq('project_id', projectId)
        .order('week_start_date', { ascending: false });

      if (!error && data) {
        setWeeks(data as unknown as CalendarWeek[]);
      }
      setLoading(false);
    }

    loadWeeks();
  }, [projectId]);

  // Generate week
  const generateWeek = async () => {
    setGenerating(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/weeks/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: format(currentWeekStart, 'yyyy-MM-dd'),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate week');
      }

      toast.success('Generation started');
      router.push(`/projects/${projectId}/runs/${data.generation_run_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate week');
    } finally {
      setGenerating(false);
    }
  };

  // Get current week
  const currentWeek = weeks.find((w) =>
    isSameWeek(new Date(w.week_start_date), currentWeekStart, { weekStartsOn: 1 })
  );

  // Navigate weeks
  const prevWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const nextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));

  return (
    <AppShell title="Calendar" projectId={projectId}>
      <div className="space-y-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Week of {format(currentWeekStart, 'MMM d, yyyy')}
              </h2>
              <p className="text-sm text-zinc-500">{format(currentWeekStart, 'MMMM yyyy')}</p>
            </div>
            <Button variant="outline" size="icon" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentWeek ? (
              <Button onClick={() => router.push(`/projects/${projectId}/weeks/${currentWeek.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                View Week
              </Button>
            ) : (
              <Button onClick={generateWeek} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Week
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Week Content */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : currentWeek ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className={STATUS_COLORS[currentWeek.status]}>{currentWeek.status}</Badge>
              <span className="text-sm text-zinc-500">
                {currentWeek.calendar_items?.length ?? 0} items
              </span>
            </div>

            {/* Calendar Grid */}
            <div className="grid gap-4 md:grid-cols-5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, dayIndex) => {
                const dayItems =
                  currentWeek.calendar_items?.filter((item) => {
                    const itemDate = new Date(item.scheduled_at);
                    return itemDate.getDay() === (dayIndex + 1) % 7;
                  }) ?? [];

                return (
                  <Card key={day} className="min-h-[200px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{day}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dayItems.length === 0 ? (
                        <p className="text-xs text-zinc-500">No posts</p>
                      ) : (
                        dayItems.map((item) => (
                          <div
                            key={item.id}
                            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            onClick={() =>
                              router.push(`/projects/${projectId}/weeks/${currentWeek.id}`)
                            }
                          >
                            <div className="text-xs font-medium">r/{item.subreddits?.name}</div>
                            <div className="text-xs text-zinc-500">{item.personas?.name}</div>
                            <div className="text-xs text-zinc-400">
                              {format(new Date(item.scheduled_at), 'h:mm a')}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CalendarIcon className="h-12 w-12 text-zinc-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No content for this week</h3>
              <p className="text-sm text-zinc-500 mb-6 text-center max-w-md">
                Generate content for this week to start planning your Reddit posts.
              </p>
              <Button onClick={generateWeek} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Week
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Recent Weeks */}
        {weeks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>All Weeks</CardTitle>
              <CardDescription>Your generated content weeks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weeks.map((week) => (
                  <div
                    key={week.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    onClick={() => router.push(`/projects/${projectId}/weeks/${week.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarIcon className="h-4 w-4 text-zinc-400" />
                      <span className="font-medium">
                        Week of {format(new Date(week.week_start_date), 'MMM d, yyyy')}
                      </span>
                      <Badge className={STATUS_COLORS[week.status]}>{week.status}</Badge>
                    </div>
                    <span className="text-sm text-zinc-500">
                      {week.calendar_items?.length ?? 0} items
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
