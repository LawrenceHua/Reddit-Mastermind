-- Security fix: Remove org_members privilege escalation
-- This migration adds create_org_with_owner() RPC and removes the dangerous INSERT policy

-- ============================================
-- SCHEMA CHANGES
-- ============================================

-- Add created_by to track org creator (needed for future policies)
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- ============================================
-- REMOVE DANGEROUS POLICIES
-- ============================================

-- Drop the dangerous policy that allows any user to add themselves to any org with any role
DROP POLICY IF EXISTS "Users can add themselves to orgs" ON org_members;

-- ============================================
-- CREATE SECURE RPC
-- ============================================

-- Create org with owner in a single atomic operation
-- This is the ONLY way to create an org with an admin membership
CREATE OR REPLACE FUNCTION create_org_with_owner(org_name TEXT)
RETURNS TABLE(org_id UUID, member_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  new_member_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the current user's ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Validate org name
  IF org_name IS NULL OR LENGTH(TRIM(org_name)) < 1 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;
  
  -- Create the organization
  INSERT INTO orgs (name, created_by)
  VALUES (TRIM(org_name), current_user_id)
  RETURNING id INTO new_org_id;
  
  -- Create the admin membership for the creator
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'admin')
  RETURNING id INTO new_member_id;
  
  -- Return the created IDs
  RETURN QUERY SELECT new_org_id, new_member_id;
END;
$$;

-- Grant execute to authenticated users (they can create orgs)
GRANT EXECUTE ON FUNCTION create_org_with_owner(TEXT) TO authenticated;

-- ============================================
-- ADD INVITE-BASED MEMBERSHIP (Optional safer alternative)
-- ============================================

-- Create org invitations table for future use
CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role org_role NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);

-- Enable RLS
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for org_invitations
CREATE POLICY "Admins can view invitations"
ON org_invitations FOR SELECT
USING (user_is_org_admin(org_id));

CREATE POLICY "Admins can create invitations"
ON org_invitations FOR INSERT
WITH CHECK (user_is_org_admin(org_id));

CREATE POLICY "Admins can delete invitations"
ON org_invitations FOR DELETE
USING (user_is_org_admin(org_id));

-- ============================================
-- ACCEPT INVITATION RPC
-- ============================================

CREATE OR REPLACE FUNCTION accept_org_invitation(invite_token TEXT)
RETURNS TABLE(org_id UUID, member_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  new_member_id UUID;
  current_user_id UUID;
  user_email TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get user email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  
  -- Find valid invitation
  SELECT * INTO invitation
  FROM org_invitations
  WHERE token = invite_token
    AND email = user_email
    AND accepted_at IS NULL
    AND expires_at > NOW();
  
  IF invitation IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (SELECT 1 FROM org_members WHERE org_id = invitation.org_id AND user_id = current_user_id) THEN
    RAISE EXCEPTION 'Already a member of this organization';
  END IF;
  
  -- Create membership
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (invitation.org_id, current_user_id, invitation.role)
  RETURNING id INTO new_member_id;
  
  -- Mark invitation as accepted
  UPDATE org_invitations
  SET accepted_at = NOW()
  WHERE id = invitation.id;
  
  RETURN QUERY SELECT invitation.org_id, new_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_org_invitation(TEXT) TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION create_org_with_owner IS 'Creates a new organization and adds the calling user as admin. This is the only way to create an org with membership.';
COMMENT ON FUNCTION accept_org_invitation IS 'Accepts an org invitation using a token. The token must match the users email.';
COMMENT ON TABLE org_invitations IS 'Pending invitations to join organizations. Users must be invited by an admin.';

