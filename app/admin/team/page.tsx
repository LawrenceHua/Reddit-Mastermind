import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Construction } from 'lucide-react';

export default function TeamPage() {
  return (
    <AppShell title="Team Management">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Users className="h-6 w-6 text-zinc-500" />
          </div>
          <CardTitle>Team Management</CardTitle>
          <CardDescription>Manage your organization's team members</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Construction className="h-12 w-12 text-orange-500 mb-4" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Coming Soon</h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            Team management features including inviting members, managing roles, and viewing team activity are coming soon.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}

