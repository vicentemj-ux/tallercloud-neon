-- ============================================================
-- MODULO PRO: CHAT TALLER
-- ============================================================

CREATE TABLE IF NOT EXISTS workshop_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  sender_id UUID NULL,
  sender_name TEXT NOT NULL DEFAULT 'Tecnico',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_messages_taller_created
  ON workshop_messages(taller_id, created_at DESC);

ALTER TABLE workshop_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workshop_messages_tenant_policy ON workshop_messages;
CREATE POLICY workshop_messages_tenant_policy ON workshop_messages
USING ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);
