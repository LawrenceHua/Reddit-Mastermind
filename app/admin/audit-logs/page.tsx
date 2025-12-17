import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  diff_json: Record<string, unknown>;
  created_at: string;
  actor_user_id: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/10 text-green-500',
  update: 'bg-blue-500/10 text-blue-500',
  delete: 'bg-red-500/10 text-red-500',
  approve: 'bg-purple-500/10 text-purple-500',
  schedule: 'bg-orange-500/10 text-orange-500',
};

export default async function AuditLogsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership || membership.role !== 'admin') {
    redirect('/dashboard');
  }

  // Get audit logs
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <AppShell title="Audit Logs">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <p className="text-zinc-500">Track all changes made in your organization</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 100 actions</CardDescription>
          </CardHeader>
          <CardContent>
            {!logs || logs.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No audit logs yet</p>
            ) : (
              <div className="space-y-4">
                {(logs as AuditLog[]).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-4 rounded-lg border"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={ACTION_COLORS[log.action] || 'bg-zinc-500/10'}>
                          {log.action}
                        </Badge>
                        <span className="font-medium">{log.entity_type}</span>
                      </div>
                      <p className="text-sm text-zinc-500">
                        Entity ID: {log.entity_id.substring(0, 8)}...
                      </p>
                      {Object.keys(log.diff_json || {}).length > 0 && (
                        <pre className="text-xs text-zinc-400 mt-2 bg-zinc-100 dark:bg-zinc-800 p-2 rounded">
                          {JSON.stringify(log.diff_json, null, 2)}
                        </pre>
                      )}
                    </div>
                    <span className="text-sm text-zinc-500">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
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
