'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Calendar,
  User,
  Hash,
  Clock,
  Edit,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ContentAsset {
  id: string;
  asset_type: string;
  title: string | null;
  body_md: string;
  version: number;
  status: string;
  quality_scores: Array<{
    overall_score: number;
    dimensions_json: Record<string, number>;
    notes: string;
  }>;
}

interface CalendarItem {
  id: string;
  scheduled_at: string;
  status: string;
  topic_cluster_key: string | null;
  risk_flags_json: string[];
  subreddits: { id: string; name: string; risk_level: string };
  personas: { id: string; name: string; tone: string };
  content_assets: ContentAsset[];
}

interface WeekData {
  id: string;
  week_start_date: string;
  status: 'draft' | 'approved' | 'scheduled' | 'published';
  calendar_items: CalendarItem[];
  projects: { name: string };
}

const STATUS_COLORS = {
  draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  published: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  needs_review: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  posted: 'bg-green-500/10 text-green-500 border-green-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function WeekPage({
  params,
}: {
  params: Promise<{ projectId: string; weekId: string }>;
}) {
  const { projectId, weekId } = use(params);
  const router = useRouter();
  const [week, setWeek] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [approving, setApproving] = useState(false);

  // Load week data
  useEffect(() => {
    async function loadWeek() {
      try {
        const response = await fetch(`/api/weeks/${weekId}`);
        const data = await response.json();

        if (response.ok) {
          setWeek(data);
        }
      } catch (error) {
        console.error('Failed to load week:', error);
      } finally {
        setLoading(false);
      }
    }

    loadWeek();
  }, [weekId]);

  // Approve week
  const approveWeek = async () => {
    setApproving(true);
    try {
      const response = await fetch(`/api/weeks/${weekId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (response.ok) {
        setWeek((prev) => (prev ? { ...prev, status: 'approved' } : null));
        toast.success('Week approved');
      } else {
        toast.error('Failed to approve week');
      }
    } catch (error) {
      toast.error('Failed to approve week');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Week Review" projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  if (!week) {
    return (
      <AppShell title="Week Review" projectId={projectId}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-zinc-500">Week not found</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const hasCriticalFlags = week.calendar_items.some((item) =>
    item.risk_flags_json?.some((flag) =>
      ['vote_manipulation', 'fake_neutrality', 'spam_domain'].includes(flag)
    )
  );

  return (
    <AppShell
      title={`Week of ${format(new Date(week.week_start_date), 'MMM d, yyyy')}`}
      projectId={projectId}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Week Review</h2>
              <Badge className={STATUS_COLORS[week.status]}>{week.status}</Badge>
            </div>
            <p className="text-zinc-500">{week.calendar_items.length} items scheduled</p>
          </div>
          <div className="flex gap-2">
            {week.status === 'draft' && (
              <Button onClick={approveWeek} disabled={approving || hasCriticalFlags}>
                {approving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approve Week
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/projects/${projectId}/calendar`)}
            >
              Back to Calendar
            </Button>
          </div>
        </div>

        {/* Critical Flags Warning */}
        {hasCriticalFlags && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-red-500">
                Some items have critical flags that must be resolved before approval.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Items List */}
        <div className="space-y-4">
          {week.calendar_items.map((item) => {
            const postAsset = item.content_assets?.find((a) => a.asset_type === 'post');
            const score = postAsset?.quality_scores?.[0];
            const hasRiskFlags = item.risk_flags_json?.length > 0;

            return (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  hasRiskFlags ? 'border-orange-500/50' : ''
                }`}
                onClick={() => setSelectedItem(item)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          r/{item.subreddits?.name}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.personas?.name}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(item.scheduled_at), 'EEE h:mm a')}
                        </Badge>
                      </div>

                      {postAsset && (
                        <h3 className="font-semibold text-lg">
                          {postAsset.title || 'Untitled Post'}
                        </h3>
                      )}

                      {/* Risk Flags */}
                      {hasRiskFlags && (
                        <div className="flex gap-2">
                          {item.risk_flags_json.map((flag) => (
                            <Badge key={flag} variant="destructive" className="text-xs">
                              {flag.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    {score && (
                      <div className="text-right">
                        <div
                          className={`text-2xl font-bold ${
                            score.overall_score >= 7
                              ? 'text-green-500'
                              : score.overall_score >= 5
                                ? 'text-yellow-500'
                                : 'text-red-500'
                          }`}
                        >
                          {score.overall_score.toFixed(1)}
                        </div>
                        <div className="text-xs text-zinc-500">Quality Score</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Preview Drawer */}
        <Sheet open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <SheetContent className="w-full sm:max-w-2xl">
            {selectedItem && (
              <>
                <SheetHeader>
                  <SheetTitle>Post Preview</SheetTitle>
                  <SheetDescription>
                    r/{selectedItem.subreddits?.name} • {selectedItem.personas?.name}
                  </SheetDescription>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-200px)] mt-6">
                  <div className="space-y-6 pr-4">
                    {selectedItem.content_assets?.map((asset) => (
                      <div key={asset.id} className="space-y-4">
                        {asset.asset_type === 'post' && (
                          <>
                            <div>
                              <h3 className="text-xl font-semibold mb-2">
                                {asset.title || 'Untitled'}
                              </h3>
                              <div className="prose prose-zinc dark:prose-invert max-w-none">
                                <div className="whitespace-pre-wrap text-sm">{asset.body_md}</div>
                              </div>
                            </div>

                            {/* Quality Scores */}
                            {asset.quality_scores?.[0] && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-semibold mb-3">Quality Scores</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(asset.quality_scores[0].dimensions_json).map(
                                      ([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-sm text-zinc-500 capitalize">
                                            {key.replace(/_/g, ' ')}
                                          </span>
                                          <span
                                            className={`font-medium ${
                                              value >= 7
                                                ? 'text-green-500'
                                                : value >= 5
                                                  ? 'text-yellow-500'
                                                  : 'text-red-500'
                                            }`}
                                          >
                                            {value.toFixed(1)}
                                          </span>
                                        </div>
                                      )
                                    )}
                                  </div>
                                  {asset.quality_scores[0].notes && (
                                    <p className="mt-3 text-sm text-zinc-500">
                                      {asset.quality_scores[0].notes}
                                    </p>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        )}

                        {asset.asset_type === 'followup' && (
                          <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                            <p className="text-xs text-zinc-500 mb-2">Follow-up Comment</p>
                            <div className="text-sm whitespace-pre-wrap">{asset.body_md}</div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Risk Flags */}
                    {selectedItem.risk_flags_json?.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            Risk Flags
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedItem.risk_flags_json.map((flag) => (
                              <Badge key={flag} variant="outline" className="border-orange-500/50">
                                {flag.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>

                {/* Actions */}
                <div className="flex gap-2 mt-6">
                  <Button variant="outline" className="flex-1">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}
