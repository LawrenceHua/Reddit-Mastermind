'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles } from 'lucide-react';

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!orgName.trim()) {
      setError('Organization name is required');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('You must be logged in');
      setIsLoading(false);
      return;
    }

    // Create org
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .insert({ name: orgName.trim() })
      .select()
      .single();

    if (orgError) {
      setError(orgError.message);
      setIsLoading(false);
      return;
    }

    // Add user as admin
    const { error: memberError } = await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'admin',
    });

    if (memberError) {
      setError(memberError.message);
      setIsLoading(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-xl text-zinc-100">Welcome to Reddit Ops</CardTitle>
          <CardDescription className="text-zinc-400">
            Let&apos;s set up your organization to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="border-red-900 bg-red-950/50">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-zinc-300">
                Organization name
              </Label>
              <Input
                id="orgName"
                type="text"
                placeholder="Your company or team name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
