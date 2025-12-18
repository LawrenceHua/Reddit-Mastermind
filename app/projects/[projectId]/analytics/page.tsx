'use client';

import { use } from 'react';
import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Construction } from 'lucide-react';

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return (
    <AppShell title="Analytics" projectId={projectId}>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <BarChart3 className="h-6 w-6 text-zinc-500" />
          </div>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>Track your content performance</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Construction className="h-12 w-12 text-orange-500 mb-4" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Coming Soon</h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            Analytics features including post performance tracking, engagement metrics, and trend analysis are coming soon.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}

