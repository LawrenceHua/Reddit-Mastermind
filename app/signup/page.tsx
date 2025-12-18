'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2, CheckCircle } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          org_name: orgName,
        },
      },
    });

    if (authError) {
      // Handle specific error messages
      if (authError.message.toLowerCase().includes('already registered') || 
          authError.message.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(authError.message);
      }
      setIsLoading(false);
      return;
    }

    // Check if user already exists (Supabase returns user with empty identities for existing users)
    if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
      setError('An account with this email already exists. Please sign in instead.');
      setIsLoading(false);
      return;
    }

    // If email confirmation is required (user exists but not confirmed yet)
    if (authData.user && !authData.session) {
      setSuccess(true);
      setIsLoading(false);
      return;
    }

    // If confirmed immediately (email confirmation disabled), create org and redirect
    if (authData.user && authData.session) {
      // Create org directly
      const { data: newOrg, error: orgError } = await (supabase
        .from('orgs') as any)
        .insert({ name: orgName.trim() || 'My Organization', created_by: authData.user.id })
        .select('id')
        .single();

      if (!orgError && newOrg) {
        // Create membership
        await (supabase.from('org_members') as any).insert({
          org_id: newOrg.id,
          user_id: authData.user.id,
          role: 'admin',
        });
      }

      router.push('/dashboard');
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-4">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-600">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-xl text-zinc-100">Check your email</CardTitle>
            <CardDescription className="text-zinc-400">
              We sent a confirmation link to <strong className="text-zinc-200">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-zinc-500">
              Click the link in the email to confirm your account and complete setup.
            </p>
            <Link href="/login">
              <Button variant="ghost" className="mt-4 text-zinc-400 hover:text-zinc-100">
                Back to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-xl text-zinc-100">Create your account</CardTitle>
          <CardDescription className="text-zinc-400">
            Start planning high-quality Reddit content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="border-red-900 bg-red-950/50">
                <AlertDescription>
                  {error}
                  {error.includes('already exists') && (
                    <Link href="/login" className="ml-2 underline hover:text-red-300">
                      Sign in here
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-zinc-300">
                Organization name
              </Label>
              <Input
                id="orgName"
                type="text"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-zinc-300">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-500 hover:text-orange-400">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
