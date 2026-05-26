-- ============================================================
-- CHAT TALLER: MENSAJERIA PRIVADA 1:1
-- ============================================================

ALTER TABLE workshop_messages
  ADD COLUMN IF NOT EXISTS recipient_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_messages_taller_recipient_created
  ON workshop_messages(taller_id, recipient_id, created_at DESC);
