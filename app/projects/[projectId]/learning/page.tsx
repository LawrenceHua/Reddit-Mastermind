'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  Star,
  TrendingUp,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  BookOpen,
  Sparkles,
  Target,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

interface LearningStats {
  totalContent: number;
  ratedContent: number;
  postedContent: number;
  avgRating: number | null;
  avgQualityScore: number | null;
  ratingDistribution: Record<string, number>;
  topExamples: number;
  fineTuningReady: boolean;
  fineTuningProgress: number;
}

interface Example {
  id: string;
  title: string | null;
  body_md: string;
  user_rating: number | null;
  reddit_score: number | null;
  is_curated: boolean;
  use_count: number;
  created_at: string;
}

export default function LearningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadLearningData();
  }, [projectId]);

  const loadLearningData = async () => {
    const supabase = createClient();

    try {
      // Get all content assets for this project
      const { data: assets } = await supabase
        .from('content_assets')
        .select(`
          id,
          user_rating,
          was_posted,
          reddit_score,
          metadata_json,
          calendar_items!inner(
            calendar_weeks!inner(project_id)
          )
        `)
        .eq('calendar_items.calendar_weeks.project_id', projectId);

      // Calculate stats
      const total = assets?.length || 0;
      const rated = assets?.filter((a: any) => a.user_rating != null).length || 0;
      const posted = assets?.filter((a: any) => a.was_posted).length || 0;

      const ratings = assets
        ?.filter((a: any) => a.user_rating != null)
        .map((a: any) => a.user_rating as number) || [];

      const avgRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;

      const qualityScores = assets
        ?.filter((a: any) => (a.metadata_json as any)?.quality_score != null)
        .map((a: any) => (a.metadata_json as any).quality_score as number) || [];

      const avgQualityScore = qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : null;

      // Rating distribution
      const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      ratings.forEach((r) => {
        ratingDistribution[r.toString()] = (ratingDistribution[r.toString()] || 0) + 1;
      });

      // Get prompt examples
      const { data: examplesData, count: exampleCount } = await supabase
        .from('prompt_examples')
        .select('*', { count: 'exact' })
        .eq('project_id', projectId)
        .order('user_rating', { ascending: false })
        .limit(10);

      // Fine-tuning readiness (need 50+ high-quality examples)
      const highQualityCount = (ratingDistribution['4'] || 0) + (ratingDistribution['5'] || 0);
      const minRequired = 50;

      setStats({
        totalContent: total,
        ratedContent: rated,
        postedContent: posted,
        avgRating,
        avgQualityScore,
        ratingDistribution,
        topExamples: exampleCount || 0,
        fineTuningReady: highQualityCount >= minRequired,
        fineTuningProgress: Math.min(100, (highQualityCount / minRequired) * 100),
      });

      setExamples((examplesData || []) as Example[]);
    } catch (error) {
      console.error('Error loading learning data:', error);
      toast.error('Failed to load learning data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportTrainingData = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/learning/export`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training-data-${projectId.slice(0, 8)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Training data exported!');
    } catch (error) {
      toast.error('Failed to export training data');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Learning" projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Learning & Improvement" projectId={projectId}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-purple-500" />
              Learning Dashboard
            </h2>
            <p className="text-zinc-500">
              Track content performance and train better AI models
            </p>
          </div>
          <Button
            onClick={handleExportTrainingData}
            disabled={exporting || !stats?.fineTuningReady}
            variant={stats?.fineTuningReady ? 'default' : 'outline'}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export Training Data
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Content</CardTitle>
              <BookOpen className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalContent || 0}</div>
              <p className="text-xs text-zinc-500">
                {stats?.ratedContent || 0} rated, {stats?.postedContent || 0} posted
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.avgRating ? stats.avgRating.toFixed(1) : '—'}/5
              </div>
              <p className="text-xs text-zinc-500">
                From {stats?.ratedContent || 0} rated items
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
              <Target className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.avgQualityScore ? stats.avgQualityScore.toFixed(1) : '—'}/10
              </div>
              <p className="text-xs text-zinc-500">AI-generated quality score</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Learning Examples</CardTitle>
              <Sparkles className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topExamples || 0}</div>
              <p className="text-xs text-zinc-500">High-quality examples saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Fine-tuning Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Fine-Tuning Readiness
            </CardTitle>
            <CardDescription>
              Collect 50+ high-quality (4-5 star) examples to enable model fine-tuning
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Progress value={stats?.fineTuningProgress || 0} className="flex-1" />
              <span className="text-sm font-medium w-16 text-right">
                {Math.round(stats?.fineTuningProgress || 0)}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              {stats?.fineTuningReady ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-green-600 font-medium">
                    Ready for fine-tuning! You have enough high-quality examples.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                  <span className="text-yellow-600">
                    Need {50 - ((stats?.ratingDistribution['4'] || 0) + (stats?.ratingDistribution['5'] || 0))} more 4-5 star rated posts
                  </span>
                </>
              )}
            </div>

            {/* Rating Distribution */}
            <div className="pt-4">
              <h4 className="text-sm font-medium mb-3">Rating Distribution</h4>
              <div className="flex items-end gap-2 h-24">
                {['1', '2', '3', '4', '5'].map((rating) => {
                  const count = stats?.ratingDistribution[rating] || 0;
                  const maxCount = Math.max(...Object.values(stats?.ratingDistribution || {}), 1);
                  const height = (count / maxCount) * 100;

                  return (
                    <div key={rating} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t transition-all ${
                          parseInt(rating) >= 4 ? 'bg-green-500' : 'bg-zinc-300'
                        }`}
                        style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                      />
                      <span className="text-xs text-zinc-500">{rating}★</span>
                      <span className="text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Examples and Metrics */}
        <Tabs defaultValue="examples">
          <TabsList>
            <TabsTrigger value="examples">
              <BookOpen className="h-4 w-4 mr-2" />
              Top Examples
            </TabsTrigger>
            <TabsTrigger value="tips">
              <Sparkles className="h-4 w-4 mr-2" />
              Improvement Tips
            </TabsTrigger>
          </TabsList>

          <TabsContent value="examples" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>High-Performing Content</CardTitle>
                <CardDescription>
                  These examples are automatically used to improve future generations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {examples.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No examples yet. Rate your content to build the learning database!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {examples.map((example) => (
                      <div
                        key={example.id}
                        className="p-4 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {example.title && (
                              <h4 className="font-medium mb-1">{example.title}</h4>
                            )}
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                              {example.body_md}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {example.user_rating && (
                              <Badge className="bg-yellow-500/10 text-yellow-600">
                                {example.user_rating}★
                              </Badge>
                            )}
                            {example.reddit_score && (
                              <Badge variant="outline">
                                ↑{example.reddit_score}
                              </Badge>
                            )}
                            {example.is_curated && (
                              <Badge className="bg-purple-500/10 text-purple-600">
                                Curated
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-zinc-400">
                          Used in {example.use_count} generations
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>How to Improve Your AI</CardTitle>
                <CardDescription>
                  Follow these steps to train better content generation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h4 className="font-medium">Rate Your Content</h4>
                      <p className="text-sm text-zinc-500">
                        After reviewing generated posts, rate them 1-5 stars. This teaches the
                        AI what you consider high quality.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h4 className="font-medium">Mark Posted Content</h4>
                      <p className="text-sm text-zinc-500">
                        Check &quot;I posted this&quot; when you actually use content on Reddit. This
                        helps us know which content passes your quality bar.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                      3
                    </div>
                    <div>
                      <h4 className="font-medium">Track Reddit Performance</h4>
                      <p className="text-sm text-zinc-500">
                        Optionally add the Reddit URL and upvote count. This real-world data is
                        the most valuable signal for improvement.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                      4
                    </div>
                    <div>
                      <h4 className="font-medium">Automatic Few-Shot Learning</h4>
                      <p className="text-sm text-zinc-500">
                        Once you have 4-5 star examples, they&apos;re automatically included in
                        future prompts. The AI learns your style!
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold">
                      5
                    </div>
                    <div>
                      <h4 className="font-medium">Fine-Tune a Custom Model</h4>
                      <p className="text-sm text-zinc-500">
                        With 50+ high-quality examples, you can export training data and
                        fine-tune a custom GPT model that perfectly matches your brand voice.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

