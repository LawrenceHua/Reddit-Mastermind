'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Calendar,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  posts_per_week: number;
  company_profile_json: {
    name?: string;
    industry?: string;
  } | null;
}

interface Stats {
  totalProjects: number;
  scheduledPosts: number;
  postsThisWeek: number;
  pendingReview: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalProjects: 0,
    scheduledPosts: 0,
    postsThisWeek: 0,
    pendingReview: 0,
  });

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient();

      // Get user's org
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Get org membership
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id);

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }

      const orgId = (memberships[0] as any).org_id;

      // Get projects
      const { data: projectsData } = await supabase
        .from('projects')
        .select('*')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (projectsData) {
        setProjects(projectsData as Project[]);
      }

      // Get stats
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId);

      // Get calendar items stats
      const { data: allItems } = await supabase
        .from('calendar_items')
        .select('id, status, scheduled_at, calendar_weeks!inner(projects!inner(org_id))')
        .eq('calendar_weeks.projects.org_id', orgId);

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());

      let scheduled = 0;
      let thisWeek = 0;
      let pending = 0;

      (allItems || []).forEach((item: any) => {
        if (item.status === 'scheduled') scheduled++;
        if (item.status === 'draft') pending++;
        
        const itemDate = new Date(item.scheduled_at);
        if (itemDate >= weekStart && itemDate <= now) {
          thisWeek++;
        }
      });

      setStats({
        totalProjects: projectCount || 0,
        scheduledPosts: scheduled,
        postsThisWeek: thisWeek,
        pendingReview: pending,
      });

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  return (
    <AppShell title="Dashboard" showSearch>
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Welcome back</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Here&apos;s what&apos;s happening with your content operations.
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <FileText className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalProjects}</div>
                  <p className="text-xs text-zinc-500">
                    {stats.totalProjects === 0 ? 'Get started by creating a project' : 'Active projects'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Posts</CardTitle>
              <Calendar className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.scheduledPosts}</div>
                  <p className="text-xs text-zinc-500">Posts pending publication</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Posts This Week</CardTitle>
              <TrendingUp className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.postsThisWeek}</div>
                  <p className="text-xs text-zinc-500">Content created this week</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.pendingReview}</div>
                  <p className="text-xs text-zinc-500">Items awaiting approval</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your most recently updated projects</CardDescription>
            </div>
            {projects.length > 0 && (
              <Link href="/projects">
                <Button variant="outline" size="sm">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 p-4">
                  <Sparkles className="h-8 w-8 text-orange-500" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Get started with your first project
                </h3>
                <p className="mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                  Create a project to set up your company profile, writing personas, and target
                  subreddits. Then generate AI-powered content for Reddit.
                </p>
                <Link href="/projects/new" className="mt-6">
                  <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/projects/${project.id}/setup`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
                        <span className="text-lg font-bold text-white">
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                          {project.company_profile_json?.industry && (
                            <Badge variant="secondary" className="text-xs">
                              {project.company_profile_json.industry}
                            </Badge>
                          )}
                          <span>{project.posts_per_week} posts/week</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400">
                        Updated {format(new Date(project.updated_at), 'MMM d')}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/setup`);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/calendar`);
                          }}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-orange-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/calendar`);
                          }}
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
