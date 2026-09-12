CREATE TABLE webapp.oauth_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  audience text NOT NULL CHECK (
    audience ~ '^https?://[^/?#@[:space:]]+$'
  )
);

REVOKE ALL ON TABLE webapp.oauth_configuration FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT SELECT ON TABLE webapp.oauth_configuration TO supabase_auth_admin;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION webapp.oauth_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  audience text;
BEGIN
  IF claims ? 'client_id' THEN
    SELECT configuration.audience
    INTO audience
    FROM webapp.oauth_configuration AS configuration
    WHERE configuration.singleton;

    IF audience IS NULL THEN
      RAISE EXCEPTION 'The OAuth audience is not configured.';
    END IF;

    claims := jsonb_set(claims, '{aud}', to_jsonb(audience));
  END IF;

  RETURN jsonb_build_object('claims', claims);
END
$$;
