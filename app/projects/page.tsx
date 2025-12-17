import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Calendar, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function ProjectsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user's org membership
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role, orgs(name)')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    redirect('/onboarding');
  }

  // Get projects for the org
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', membership.org_id)
    .order('updated_at', { ascending: false });

  return (
    <AppShell title="Projects" showSearch>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Your Projects</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Manage your Reddit content operations projects
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}/setup`}>
                <Card className="cursor-pointer transition-all hover:border-orange-500/50 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/20 to-red-600/20">
                        <FileText className="h-5 w-5 text-orange-500" />
                      </div>
                      <Badge variant="secondary">{project.posts_per_week} posts/week</Badge>
                    </div>
                    <CardTitle className="mt-4">{project.name}</CardTitle>
                    <CardDescription>
                      Updated{' '}
                      {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <Calendar className="h-4 w-4" />
                        <span>Risk: {project.risk_tolerance}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-zinc-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                <FileText className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                No projects yet
              </h3>
              <p className="mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                Create your first project to start planning and generating high-quality Reddit
                content.
              </p>
              <Link href="/projects/new" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first project
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
