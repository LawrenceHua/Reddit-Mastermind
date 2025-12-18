'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Settings,
  FileText,
  Users,
  Sparkles,
  ClipboardList,
  BarChart3,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  pattern?: RegExp;
}

const mainNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Projects',
    href: '/projects',
    icon: FileText,
    pattern: /^\/projects/,
  },
];

const projectNavItems: NavItem[] = [
  {
    title: 'Setup',
    href: '/setup',
    icon: Settings,
  },
  {
    title: 'Calendar',
    href: '/calendar',
    icon: Calendar,
  },
  {
    title: 'Generation Runs',
    href: '/runs',
    icon: Sparkles,
  },
  {
    title: 'Learning',
    href: '/learning',
    icon: Brain,
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
];

const adminNavItems: NavItem[] = [
  {
    title: 'Audit Logs',
    href: '/admin/audit-logs',
    icon: ClipboardList,
  },
  {
    title: 'Team',
    href: '/admin/team',
    icon: Users,
  },
];

interface SidebarProps {
  projectId?: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem, basePath = '') => {
    const fullHref = basePath + item.href;
    if (item.pattern) {
      return item.pattern.test(pathname);
    }
    return pathname === fullHref || pathname.startsWith(fullHref + '/');
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-16 items-center border-b border-zinc-200 px-6 dark:border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Reddit Ops</span>
        </Link>
      </div>

      <ScrollArea className="h-[calc(100vh-4rem)]">
        <nav className="space-y-6 p-4">
          {/* Main Navigation */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Main
            </p>
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </div>

          {/* Project Navigation - only show if projectId is provided */}
          {projectId && (
            <div className="space-y-1">
              <p className="px-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Project
              </p>
              {projectNavItems.map((item) => {
                const href = `/projects/${projectId}${item.href}`;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      pathname.startsWith(href)
                        ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Admin Navigation */}
          <div className="space-y-1">
            <p className="px-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Admin
            </p>
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </div>
        </nav>
      </ScrollArea>
    </aside>
  );
}
