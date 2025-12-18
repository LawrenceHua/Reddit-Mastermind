-- Restrict job-related SECURITY DEFINER functions
-- Only service role should be able to claim and manage jobs

-- Revoke execute from anon and authenticated roles for job functions
REVOKE EXECUTE ON FUNCTION claim_next_job(TEXT, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_next_job(TEXT, INTEGER) FROM authenticated;

REVOKE EXECUTE ON FUNCTION cleanup_stale_job_locks(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_stale_job_locks(INTEGER) FROM authenticated;

-- Ensure service_role can execute (this is default but making explicit)
GRANT EXECUTE ON FUNCTION claim_next_job(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_stale_job_locks(INTEGER) TO service_role;

-- Comments explaining the security model
COMMENT ON FUNCTION claim_next_job IS 'Claims the next available job for processing. Only callable by service role (backend workers).';
COMMENT ON FUNCTION cleanup_stale_job_locks IS 'Releases stale job locks. Only callable by service role (backend workers).';

-- Note: create_org_with_owner and accept_org_invitation remain callable by authenticated users
-- as they are designed for user-initiated org creation and invitation acceptance

