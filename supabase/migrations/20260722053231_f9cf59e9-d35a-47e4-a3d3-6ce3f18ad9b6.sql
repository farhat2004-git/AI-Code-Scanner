
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paste',
  ADD COLUMN IF NOT EXISTS repo_full_name text,
  ADD COLUMN IF NOT EXISTS ref text,
  ADD COLUMN IF NOT EXISTS file_path text;
