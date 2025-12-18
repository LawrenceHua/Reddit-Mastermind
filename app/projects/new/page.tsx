'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles } from 'lucide-react';

export default function NewProjectPage() {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!name.trim()) {
      setError('Project name is required');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    // Get current user and their org
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('You must be logged in');
      setIsLoading(false);
      return;
    }

    // Get user's org memberships (avoid .single() to prevent errors)
    const { data: memberships } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id);

    // If no memberships, redirect to onboarding to create org
    if (!memberships || memberships.length === 0) {
      router.push('/onboarding');
      return;
    }

    const membership = memberships[0];

    // Create the project
    const { data: project, error: projectError } = await (supabase
      .from('projects') as any)
      .insert({
        org_id: (membership as any).org_id,
        name: name.trim(),
        company_profile_json: {},
        brand_voice_json: {},
        posts_per_week: 5,
        risk_tolerance: 'medium',
      })
      .select()
      .single();

    if (projectError) {
      setError(projectError.message);
      setIsLoading(false);
      return;
    }

    // Redirect to setup wizard
    router.push(`/projects/${(project as any).id}/setup`);
  };

  return (
    <AppShell title="Create Project">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <CardTitle>Create a new project</CardTitle>
            <CardDescription>
              Each project represents a Reddit content campaign. After this, you&apos;ll set up
              your company info, personas, and target subreddits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g., SlideForge Reddit Campaign"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-sm text-zinc-500">
                  Choose a descriptive name that helps you identify this project
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create project'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
