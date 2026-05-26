-- Agregar columnas para verificación y reset de contraseña a taller_users
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP DEFAULT NULL;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS verification_token TEXT DEFAULT NULL;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP DEFAULT NULL;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT NULL;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP DEFAULT NULL;
ALTER TABLE taller_users ADD COLUMN IF NOT EXISTS last_reset_email_sent_at TIMESTAMP DEFAULT NULL;

-- Crear índices para búsqueda rápida de tokens
CREATE INDEX IF NOT EXISTS idx_taller_users_verification_token ON taller_users(verification_token);
CREATE INDEX IF NOT EXISTS idx_taller_users_reset_token ON taller_users(reset_token);
CREATE INDEX IF NOT EXISTS idx_taller_users_email_verified ON taller_users(email_verified);
