-- The brands_guard_update trigger blocked ALL updates to id/name/domain/
-- logo_url/created_by/created_at regardless of who was making them,
-- including the project owner working directly in the SQL editor. Scope
-- the guard to only fire for real end-user requests through the app
-- (PostgREST sets auth.role() = 'authenticated' per request) — a direct
-- SQL/admin session (SQL editor, service role) carries no JWT claims, so
-- auth.role() is NULL there and the guard no longer applies.
CREATE OR REPLACE FUNCTION public.brands_guard_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.domain IS DISTINCT FROM OLD.domain
       OR NEW.logo_url IS DISTINCT FROM OLD.logo_url
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'brands: only category and description (once) may be updated'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.description IS DISTINCT FROM OLD.description AND OLD.description IS NOT NULL THEN
      RAISE EXCEPTION 'brands: description can only be set once, not overwritten'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
