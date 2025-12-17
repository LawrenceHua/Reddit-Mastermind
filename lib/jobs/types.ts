import type { JobType, JobStatus } from '@/lib/database.types';

export interface Job {
  id: string;
  org_id: string;
  project_id: string;
  job_type: JobType;
  payload_json: Record<string, unknown>;
  status: JobStatus;
  run_at: string;
  attempts: number;
  last_error: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface WorkerConfig {
  maxConcurrency: number;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  maxAttempts: number;
  workerId: string;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  maxConcurrency: 5,
  pollIntervalMs: 1000,
  lockTimeoutMs: 300000, // 5 minutes
  maxAttempts: 3,
  workerId: `worker-${Date.now()}`,
};

// Job payload types
export interface GenerateWeekPayload {
  week_start_date: string;
  calendar_week_id: string;
  generation_run_id: string;
  posts_per_week: number;
}

export interface GenerateItemPayload {
  calendar_item_id: string;
  generation_run_id: string;
}

export interface PublishItemPayload {
  calendar_item_id: string;
  content_asset_id: string;
}
