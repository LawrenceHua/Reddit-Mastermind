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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Eye,
  CheckCircle,
} from 'lucide-react';
import { format, startOfWeek, addWeeks, subWeeks, isSameWeek, parseISO, addDays } from 'date-fns';
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
    subreddits: { name: string } | null;
    personas: { name: string } | null;
  }>;
}

const STATUS_COLORS = {
  draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  generating: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
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
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );

  // Load weeks
  const loadWeeks = async () => {
    const supabase = createClient();

    // First get weeks
    const { data: weeksData, error: weeksError } = await supabase
      .from('calendar_weeks')
      .select('*')
      .eq('project_id', projectId)
      .order('week_start_date', { ascending: false });

    console.log('[Calendar] Loaded weeks:', weeksData?.length, 'Error:', weeksError);

    if (weeksError) {
      console.error('Error loading weeks:', weeksError);
      setLoading(false);
      return;
    }

    if (!weeksData || weeksData.length === 0) {
      console.log('[Calendar] No weeks found for project:', projectId);
      setWeeks([]);
      setLoading(false);
      return;
    }

    // Then get items for each week with related data
    const weeksWithItems: CalendarWeek[] = [];
    
    for (const week of weeksData) {
      const weekRecord = week as { 
        id: string; 
        week_start_date: string; 
        status: string; 
        generation_run_id: string | null;
      };
      
      const { data: items } = await supabase
        .from('calendar_items')
        .select('id, scheduled_at, status, subreddit_id, persona_id')
        .eq('calendar_week_id', weekRecord.id);

      console.log(`[Calendar] Week ${weekRecord.id} has ${items?.length ?? 0} items`);

      // Get subreddit and persona names
      const itemsWithDetails = await Promise.all(
        ((items || []) as Array<{ id: string; scheduled_at: string; status: string; subreddit_id: string; persona_id: string }>).map(async (item) => {
          const [subResult, personaResult] = await Promise.all([
            supabase.from('subreddits').select('name').eq('id', item.subreddit_id).single(),
            supabase.from('personas').select('name').eq('id', item.persona_id).single(),
          ]);
          
          return {
            ...item,
            subreddits: subResult.data as { name: string } | null,
            personas: personaResult.data as { name: string } | null,
          };
        })
      );

      weeksWithItems.push({
        id: weekRecord.id,
        week_start_date: weekRecord.week_start_date,
        status: weekRecord.status as CalendarWeek['status'],
        generation_run_id: weekRecord.generation_run_id,
        calendar_items: itemsWithDetails,
      });
    }

    console.log('[Calendar] Final weeks with items:', weeksWithItems.length);
    setWeeks(weeksWithItems);
    setLoading(false);
  };

  useEffect(() => {
    loadWeeks();
  }, [projectId]);

  // Generate week - redirects to generation runs page
  const generateWeek = async () => {
    setGenerating(true);
    toast.info('Starting content generation...');

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

      toast.success(`Created ${data.items_created} posts!`);
      
      // Redirect to the specific generation run page
      router.push(`/projects/${projectId}/runs/${data.generation_run_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate week');
      setGenerating(false);
    }
  };

  // Get current week
  const currentWeek = weeks.find((w) =>
    isSameWeek(parseISO(w.week_start_date + 'T12:00:00'), currentWeekStart, { weekStartsOn: 0 })
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
            <Button variant="outline" size="icon" onClick={prevWeek} disabled={generating}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Week of {format(currentWeekStart, 'MMM d, yyyy')}
              </h2>
              <p className="text-sm text-zinc-500">{format(currentWeekStart, 'MMMM yyyy')}</p>
            </div>
            <Button variant="outline" size="icon" onClick={nextWeek} disabled={generating}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentWeek && !generating ? (
              <>
                <Button variant="outline" onClick={generateWeek}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
                <Button onClick={() => router.push(`/projects/${projectId}/weeks/${currentWeek.id}`)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Posts
                </Button>
              </>
            ) : !generating ? (
              <Button 
                onClick={generateWeek}
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Week with AI
              </Button>
            ) : null}
          </div>
        </div>

        {/* Generation in Progress */}
        {generating && (
          <Card className="border-orange-500/20 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20">
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  <span className="text-lg font-medium">Creating your Reddit content...</span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                  AI is writing posts and comment threads for this week.
                  <br />
                  You&apos;ll see the results in just a moment.
                </p>
                <p className="text-xs text-zinc-400">
                  ⏱️ Takes about 20-30 seconds
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
        ) : currentWeek && !generating ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className={STATUS_COLORS[currentWeek.status]}>{currentWeek.status}</Badge>
              <span className="text-sm text-zinc-500">
                {currentWeek.calendar_items?.length ?? 0} items
              </span>
            </div>

            {/* Calendar Grid */}
            <div className="grid gap-4 md:grid-cols-7">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => {
                const dayDate = addDays(currentWeekStart, dayIndex);
                const dayItems =
                  currentWeek.calendar_items?.filter((item) => {
                    const itemDate = new Date(item.scheduled_at);
                    return itemDate.getDay() === dayIndex;
                  }) ?? [];

                return (
                  <Card key={day} className="min-h-[200px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {day} - {format(dayDate, 'MMM d')}
                      </CardTitle>
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
                            <div className="text-xs font-medium">
                              {item.subreddits?.name || 'Unknown subreddit'}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {item.personas?.name || 'Unknown persona'}
                            </div>
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
        ) : !generating ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-4 mb-4">
                <Sparkles className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Ready to create content</h3>
              <p className="text-sm text-zinc-500 mb-2 text-center max-w-md">
                Click the button below to generate posts and comment threads for this week.
              </p>
              <p className="text-xs text-zinc-400 mb-6 text-center">
                Make sure you&apos;ve set up your personas and subreddits in the Setup tab first.
              </p>
              <Button 
                onClick={generateWeek}
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                size="lg"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Week with AI
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent Weeks */}
        {weeks.length > 0 && !generating && (
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
                        Week of {format(parseISO(week.week_start_date + 'T12:00:00'), 'MMM d, yyyy')}
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
