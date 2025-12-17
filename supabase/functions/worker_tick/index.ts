// Supabase Edge Function for processing jobs
// Deploy with: supabase functions deploy worker_tick

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_JOBS_PER_TICK = 5;
const LOCK_TIMEOUT_MS = 300000; // 5 minutes

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const workerId = `edge-${Date.now()}`;

    let processed = 0;
    let errors = 0;

    for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
      // Claim next job
      const { data: jobs, error: claimError } = await supabase.rpc('claim_next_job', {
        worker_id: workerId,
        lock_timeout_ms: LOCK_TIMEOUT_MS,
      });

      if (claimError || !jobs || jobs.length === 0) {
        break; // No more jobs
      }

      const job = jobs[0];

      try {
        // Update to running
        await supabase
          .from('jobs')
          .update({
            status: 'running',
            attempts: job.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Process job based on type
        let success = false;
        let error = null;

        switch (job.job_type) {
          case 'generate_week':
            // In production, this would call your generation API
            // For now, we simulate success
            success = true;
            break;

          case 'generate_item':
            success = true;
            break;

          case 'publish_item':
            // Stub: would integrate with Reddit API
            success = true;
            break;

          case 'ingest_metrics':
            // Stub: would fetch Reddit metrics
            success = true;
            break;

          default:
            error = `Unknown job type: ${job.job_type}`;
        }

        // Update job status
        await supabase
          .from('jobs')
          .update({
            status: success ? 'succeeded' : 'failed',
            last_error: error,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (success) {
          processed++;
        } else {
          errors++;
        }
      } catch (err) {
        // Handle job processing error
        const shouldRetry = job.attempts < 3;
        await supabase
          .from('jobs')
          .update({
            status: shouldRetry ? 'queued' : 'failed',
            last_error: err.message,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        errors,
        worker_id: workerId,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
