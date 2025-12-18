'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  Hash,
  User,
  Clock,
  Download,
  ChevronLeft,
  Copy,
  CheckCircle,
  Edit2,
  Save,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { FeedbackPanel } from '@/components/feedback';

interface ContentAsset {
  id: string;
  title: string | null;
  body_md: string | null;
  version: number;
  status: string;
  user_rating?: number | null;
  was_posted?: boolean;
  reddit_score?: number | null;
  reddit_url?: string | null;
  metadata_json: {
    thread_role?: 'op' | 'commenter';
    asset_type?: 'post' | 'comment' | 'followup';
    slot_index?: number;
    offset_minutes_from_post?: number;
    scheduled_at?: string;
    intent?: string;
    parent_slot_index?: number | null;
    persona_name?: string;
    quality_score?: number;
    risk_flags?: string[];
    [key: string]: unknown;
  };
}

interface CalendarItem {
  id: string;
  scheduled_at: string;
  status: string;
  slot_index: number;
  subreddit_id: string;
  persona_id: string;
  subreddit_name?: string;
  persona_name?: string;
  content?: ContentAsset; // The main post
  threadComments?: ContentAsset[]; // Comments and replies
}

interface WeekData {
  id: string;
  week_start_date: string;
  status: string;
  project_name?: string;
  items: CalendarItem[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  scheduled: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  published: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load week data directly from Supabase
  useEffect(() => {
    async function loadWeek() {
      const supabase = createClient();

      // Get week info
      const { data: weekData, error: weekError } = await supabase
        .from('calendar_weeks')
        .select('*, projects(name)')
        .eq('id', weekId)
        .single();

      if (weekError || !weekData) {
        console.error('Error loading week:', weekError);
        setLoading(false);
        return;
      }

      // Get calendar items
      const { data: items, error: itemsError } = await supabase
        .from('calendar_items')
        .select('*')
        .eq('calendar_week_id', weekId)
        .order('scheduled_at', { ascending: true });

      if (itemsError) {
        console.error('Error loading items:', itemsError);
      }

      // Get subreddits and personas for each item
      const enrichedItems: CalendarItem[] = [];
      const itemsArray = (items || []) as Array<{
        id: string;
        subreddit_id: string;
        persona_id: string;
        scheduled_at: string;
        status: string;
        slot_index: number;
      }>;
      
      for (const item of itemsArray) {
        // Get subreddit name
        const { data: subreddit } = await supabase
          .from('subreddits')
          .select('name')
          .eq('id', item.subreddit_id)
          .single();

        // Get persona name
        const { data: persona } = await supabase
          .from('personas')
          .select('name')
          .eq('id', item.persona_id)
          .single();

        // Get all content assets for this item (post + comments + replies)
        const { data: contentAssets } = await supabase
          .from('content_assets')
          .select('*')
          .eq('calendar_item_id', item.id)
          .order('created_at', { ascending: true });

        const assetsArray = (contentAssets || []) as ContentAsset[];

        // Separate main post from thread comments
        const mainPost = assetsArray.find(
          (a) => a.metadata_json?.asset_type === 'post' || a.metadata_json?.slot_index === 0 || a.title
        );
        const threadComments = assetsArray.filter(
          (a) => a.metadata_json?.asset_type === 'comment' || a.metadata_json?.asset_type === 'followup'
        );

        enrichedItems.push({
          ...item,
          subreddit_name: (subreddit as { name: string } | null)?.name || 'Unknown',
          persona_name: (persona as { name: string } | null)?.name || 'Unknown',
          content: mainPost || assetsArray[0] || undefined,
          threadComments,
        });
      }

      const weekRecord = weekData as {
        id: string;
        week_start_date: string;
        status: string;
        projects?: { name: string } | null;
      };

      setWeek({
        id: weekRecord.id,
        week_start_date: weekRecord.week_start_date,
        status: weekRecord.status,
        project_name: weekRecord.projects?.name,
        items: enrichedItems,
      });

      setLoading(false);
    }

    loadWeek();
  }, [weekId]);

  // Start editing
  const startEditing = (item: CalendarItem) => {
    setEditingId(item.id);
    setEditContent({
      title: item.content?.title || '',
      body: item.content?.body_md || '',
    });
  };

  // Save edit
  const saveEdit = async (itemId: string) => {
    setSaving(true);
    const supabase = createClient();

    try {
      const item = week?.items.find(i => i.id === itemId);
      if (!item?.content?.id) {
        toast.error('No content to update');
        return;
      }

      await (supabase
        .from('content_assets') as unknown as { update: (v: { title: string; body_md: string }) => { eq: (k: string, v: string) => Promise<unknown> } })
        .update({
          title: editContent.title,
          body_md: editContent.body,
        })
        .eq('id', item.content.id);

      // Update local state
      setWeek(prev => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map(i => 
            i.id === itemId 
              ? { ...i, content: { ...i.content!, title: editContent.title, body_md: editContent.body } }
              : i
          ),
        };
      });

      setEditingId(null);
      toast.success('Content saved!');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Copy content to clipboard
  const copyContent = async (item: CalendarItem) => {
    const text = `**${item.content?.title || 'Untitled'}**\n\n${item.content?.body_md || ''}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export all
  const exportAll = () => {
    if (!week) return;

    const content = week.items.map(item => ({
      subreddit: item.subreddit_name,
      persona: item.persona_name,
      scheduled: item.scheduled_at,
      title: item.content?.title,
      body: item.content?.body_md,
    }));

    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `week-${week.week_start_date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!');
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
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => router.push(`/projects/${projectId}/calendar`)}
            >
              Back to Calendar
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Week of ${format(parseISO(week.week_start_date + 'T12:00:00'), 'MMM d, yyyy')}`}
      projectId={projectId}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => router.push(`/projects/${projectId}/calendar`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">Your Generated Posts</h2>
                <Badge className={STATUS_COLORS[week.status] || STATUS_COLORS.draft}>
                  {week.status}
                </Badge>
              </div>
              <p className="text-zinc-500">{week.items.length} posts with comment threads</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAll}>
              <Download className="mr-2 h-4 w-4" />
              Export All
            </Button>
          </div>
        </div>

        {/* Workflow Guide */}
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                ?
              </div>
              <div>
                <h3 className="font-semibold text-orange-900 dark:text-orange-200 mb-1">How to use this content</h3>
                <ol className="text-sm text-orange-800 dark:text-orange-300 space-y-1 list-decimal list-inside">
                  <li><strong>Review</strong> each post and its comment thread below</li>
                  <li><strong>Edit</strong> any content by clicking the pencil icon</li>
                  <li><strong>Copy</strong> using the copy button, then manually paste on Reddit</li>
                  <li><strong>Post comments</strong> at the suggested time offsets for natural engagement</li>
                </ol>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  💡 This tool plans content only — you control when and how to post on Reddit.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Cards */}
        {week.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500">No content generated yet.</p>
              <Button 
                className="mt-4"
                onClick={() => router.push(`/projects/${projectId}/calendar`)}
              >
                Go to Calendar to Generate
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {week.items.map((item, index) => (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="bg-zinc-50 dark:bg-zinc-800/50 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        #{index + 1}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {item.subreddit_name}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {item.persona_name}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(item.scheduled_at), 'EEE MMM d, h:mm a')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingId === item.id ? (
                        <Button 
                          size="sm" 
                          onClick={() => saveEdit(item.id)}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => startEditing(item)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyContent(item)}
                          >
                            {copiedId === item.id ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {editingId === item.id ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Title</label>
                        <input
                          className="w-full p-2 border rounded-md bg-transparent"
                          value={editContent.title}
                          onChange={(e) => setEditContent(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Body</label>
                        <Textarea
                          className="min-h-[200px]"
                          value={editContent.body}
                          onChange={(e) => setEditContent(prev => ({ ...prev, body: e.target.value }))}
                        />
                      </div>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div>
                      {/* Quality Score Badge */}
                      {item.content?.metadata_json?.quality_score && (
                        <div className="flex items-center gap-2 mb-3">
                          <Badge 
                            variant="outline" 
                            className={
                              item.content.metadata_json.quality_score >= 7
                                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                : item.content.metadata_json.quality_score >= 5
                                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                            }
                          >
                            Quality: {item.content.metadata_json.quality_score.toFixed(1)}/10
                          </Badge>
                          {(item.content.metadata_json.risk_flags?.length ?? 0) > 0 && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                              ⚠️ {item.content.metadata_json.risk_flags?.length ?? 0} risk flag(s)
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Main Post */}
                      <h3 className="text-xl font-semibold mb-4">
                        {item.content?.title || 'Untitled Post'}
                      </h3>
                      <Separator className="my-4" />
                      <div className="prose prose-zinc dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          {item.content?.body_md || 'No content generated'}
                        </p>
                      </div>

                      {/* Thread Comments Preview */}
                      {item.threadComments && item.threadComments.length > 0 && (
                        <div className="mt-6">
                          <Separator className="mb-4" />
                          <h4 className="text-sm font-semibold text-zinc-500 mb-3 flex items-center gap-2">
                            💬 Planned Thread ({item.threadComments.length} comments/replies)
                          </h4>
                          <div className="space-y-3 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
                            {item.threadComments.map((comment, cIdx) => (
                              <div 
                                key={comment.id || cIdx} 
                                className={`p-3 rounded-lg ${
                                  comment.metadata_json?.thread_role === 'op'
                                    ? 'bg-blue-500/5 border border-blue-500/20'
                                    : 'bg-zinc-100 dark:bg-zinc-800/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="text-xs">
                                    {comment.metadata_json?.thread_role === 'op' ? '👤 OP Reply' : '💬 Comment'}
                                  </Badge>
                                  <span className="text-xs text-zinc-500">
                                    by {comment.metadata_json?.persona_name || 'Unknown'}
                                  </span>
                                  {comment.metadata_json?.intent && (
                                    <Badge variant="outline" className="text-xs">
                                      {comment.metadata_json.intent}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-zinc-400 ml-auto">
                                    +{comment.metadata_json?.offset_minutes_from_post || 0}min
                                  </span>
                                </div>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                                  {comment.body_md || 'No content'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback Panel */}
                      {item.content?.id && (
                        <FeedbackPanel
                          assetId={item.content.id}
                          initialRating={item.content.user_rating}
                          initialWasPosted={item.content.was_posted}
                          initialRedditScore={item.content.reddit_score}
                          initialRedditUrl={item.content.reddit_url}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Workflow Guide */}
        <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/20">
          <CardContent className="py-4">
            <h4 className="font-semibold mb-2">📋 What&apos;s Next?</h4>
            <ol className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-decimal list-inside">
              <li>Review each post above and edit if needed</li>
              <li>Click &quot;Approve All&quot; when you&apos;re happy with the content</li>
              <li>Use the &quot;Copy&quot; button to grab content for posting to Reddit</li>
              <li>Export all posts as JSON for bulk operations</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
