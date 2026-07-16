CREATE TABLE plugin_foundry_control_room_3b1f1b2980.founder_ceo_messages (
  id text PRIMARY KEY,
  company_id uuid NOT NULL,
  agent_id uuid,
  role text NOT NULL CHECK (role IN ('founder', 'ceo', 'system')),
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  run_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX founder_ceo_messages_company_created_idx
  ON plugin_foundry_control_room_3b1f1b2980.founder_ceo_messages (company_id, created_at);
