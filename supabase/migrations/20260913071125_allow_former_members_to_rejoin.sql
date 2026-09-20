-- Former members may request approval again using a valid invitation.
-- The membership check still rejects users who currently belong to a household.
CREATE OR REPLACE FUNCTION webapp.request_join(
  invitation_hash text,
  requested_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := webapp.current_user_id();
  invitation webapp.invitations%ROWTYPE;
  request_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Missing application user context'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM webapp.members WHERE "userId" = actor_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO invitation
  FROM webapp.invitations
  WHERE hash = invitation_hash
    AND NOT revoked
    AND "expiresAt" > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO webapp.requests (
    id, "householdId", "userId", status, "displayName"
  )
  VALUES (
    gen_random_uuid(),
    invitation."householdId",
    actor_id,
    'pending',
    left(requested_display_name, 120)
  )
  ON CONFLICT ("userId", "householdId") DO UPDATE
    SET status = 'pending', "displayName" = EXCLUDED."displayName"
  RETURNING id INTO request_id;
  RETURN request_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.request_join(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION webapp.request_join(text, text)
  TO moneymap_app;
