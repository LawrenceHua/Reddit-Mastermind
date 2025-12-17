'use client';

import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  projectId?: string;
  showSearch?: boolean;
}

export function AppShell({ children, title, projectId, showSearch }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <Sidebar projectId={projectId} />
      <div className="ml-64">
        <Topbar title={title} showSearch={showSearch} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
