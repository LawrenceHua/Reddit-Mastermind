import { createAdminClient } from '@/lib/supabase/server';
import type {
  Job,
  JobResult,
  WorkerConfig,
  GenerateWeekPayload,
  GenerateItemPayload,
} from './types';
import { DEFAULT_WORKER_CONFIG } from './types';
import { processGenerateWeekJob, processGenerateItemJob } from './processors';

/**
 * Claim a job using FOR UPDATE SKIP LOCKED
 */
async function claimJob(config: WorkerConfig): Promise<Job | null> {
  const supabase = createAdminClient();

  // Use raw SQL for the SKIP LOCKED pattern
  const { data, error } = await supabase.rpc('claim_next_job', {
    worker_id: config.workerId,
    lock_timeout_ms: config.lockTimeoutMs,
  });

  if (error) {
    console.error('Error claiming job:', error);
    return null;
  }

  // Function returns an array, get first item or null
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as Job;
}

/**
 * Update job status
 */
async function updateJobStatus(
  jobId: string,
  status: 'running' | 'succeeded' | 'failed' | 'queued',
  error?: string
): Promise<void> {
  const supabase = createAdminClient();

  // First get current job to increment attempts
  const { data: currentJob } = await supabase
    .from('jobs')
    .select('attempts')
    .eq('id', jobId)
    .single();

  const updates: {
    status: 'running' | 'succeeded' | 'failed' | 'queued';
    updated_at: string;
    attempts?: number;
    locked_at?: null;
    locked_by?: null;
    last_error?: string;
  } = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'running') {
    updates.attempts = (currentJob?.attempts ?? 0) + 1;
  }

  if (status === 'succeeded' || status === 'failed') {
    updates.locked_at = null;
    updates.locked_by = null;
  }

  if (error) {
    updates.last_error = error;
  }

  await supabase.from('jobs').update(updates).eq('id', jobId);
}

/**
 * Process a single job
 */
async function processJob(job: Job): Promise<JobResult> {
  switch (job.job_type) {
    case 'generate_week':
      return processGenerateWeekJob(job.payload_json as unknown as GenerateWeekPayload);

    case 'generate_item':
      return processGenerateItemJob(job.payload_json as unknown as GenerateItemPayload);

    case 'publish_item':
      // Stub: In production, this would post to Reddit
      return { success: true, data: { message: 'Post scheduled (stub)' } };

    case 'ingest_metrics':
      // Stub: In production, this would fetch Reddit metrics
      return { success: true, data: { message: 'Metrics ingested (stub)' } };

    default:
      return { success: false, error: `Unknown job type: ${job.job_type}` };
  }
}

/**
 * Run worker tick - process available jobs
 */
export async function runWorkerTick(
  config: WorkerConfig = DEFAULT_WORKER_CONFIG
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  // Process up to maxConcurrency jobs
  for (let i = 0; i < config.maxConcurrency; i++) {
    const job = await claimJob(config);

    if (!job) {
      // No more jobs to process
      break;
    }

    try {
      await updateJobStatus(job.id, 'running');

      const result = await processJob(job);

      if (result.success) {
        await updateJobStatus(job.id, 'succeeded');
        processed++;
      } else {
        const shouldRetry = job.attempts < config.maxAttempts;
        await updateJobStatus(job.id, shouldRetry ? 'queued' : 'failed', result.error);
        errors++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const shouldRetry = job.attempts < config.maxAttempts;
      await updateJobStatus(job.id, shouldRetry ? 'queued' : 'failed', message);
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Enqueue a new job
 */
export async function enqueueJob(
  orgId: string,
  projectId: string,
  jobType: Job['job_type'],
  payload: Record<string, unknown>,
  runAt?: Date
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      org_id: orgId,
      project_id: projectId,
      job_type: jobType,
      payload_json: payload as unknown as import('@/lib/database.types').Json,
      status: 'queued' as const,
      run_at: (runAt ?? new Date()).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }

  return data.id;
}
