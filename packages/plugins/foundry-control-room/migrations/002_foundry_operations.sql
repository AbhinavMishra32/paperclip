CREATE TABLE tool_events (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  agent_id uuid,
  run_id uuid,
  tool_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  summary text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tool_events_company_created_idx ON tool_events (company_id, created_at DESC);

CREATE TABLE company_integrations (
  company_id uuid PRIMARY KEY,
  website_url text,
  vercel_project_id text,
  vercel_team_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
