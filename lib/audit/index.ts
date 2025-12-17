import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export interface AuditLogEntry {
  orgId: string;
  projectId?: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  diff?: Record<string, unknown>;
}

/**
 * Write an audit log entry
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const supabase = createAdminClient();

  await supabase.from('audit_logs').insert({
    org_id: entry.orgId,
    project_id: entry.projectId ?? null,
    actor_user_id: entry.actorUserId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    diff_json: (entry.diff ?? {}) as unknown as Json,
  });
}

/**
 * Get audit logs for an org
 */
export async function getAuditLogs(
  orgId: string,
  options: {
    projectId?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const supabase = createAdminClient();

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (options.projectId) {
    query = query.eq('project_id', options.projectId);
  }

  if (options.entityType) {
    query = query.eq('entity_type', options.entityType);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return data;
}
