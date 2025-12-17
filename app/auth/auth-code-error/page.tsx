import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-600">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-xl text-zinc-100">Authentication Error</CardTitle>
          <CardDescription className="text-zinc-400">
            There was a problem signing you in
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-zinc-500">
            The authentication link may have expired or been used already. Please try signing in
            again.
          </p>
          <Link href="/login">
            <Button className="mt-6 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700">
              Back to login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
