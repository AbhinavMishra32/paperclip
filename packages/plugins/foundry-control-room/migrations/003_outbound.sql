CREATE TABLE plugin_foundry_control_room_3b1f1b2980.leads (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  found_by_agent_id uuid,
  name text NOT NULL,
  title text,
  company_name text,
  email text NOT NULL,
  source_url text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'replied', 'bounced', 'unsubscribed', 'do_not_contact')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX leads_company_created_idx ON plugin_foundry_control_room_3b1f1b2980.leads (company_id, created_at DESC);

CREATE TABLE plugin_foundry_control_room_3b1f1b2980.outbound_emails (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES plugin_foundry_control_room_3b1f1b2980.leads (id),
  agent_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  from_email text NOT NULL,
  to_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  smtp_mode text NOT NULL CHECK (smtp_mode IN ('platform', 'custom')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbound_emails_company_created_idx ON plugin_foundry_control_room_3b1f1b2980.outbound_emails (company_id, created_at DESC);
CREATE INDEX outbound_emails_lead_idx ON plugin_foundry_control_room_3b1f1b2980.outbound_emails (lead_id, created_at DESC);

ALTER TABLE plugin_foundry_control_room_3b1f1b2980.company_integrations
  ADD COLUMN smtp_mode text NOT NULL DEFAULT 'platform' CHECK (smtp_mode IN ('platform', 'custom')),
  ADD COLUMN custom_smtp_host text,
  ADD COLUMN custom_smtp_port text,
  ADD COLUMN custom_smtp_user text,
  ADD COLUMN custom_smtp_from_email text,
  ADD COLUMN custom_smtp_from_name text;
