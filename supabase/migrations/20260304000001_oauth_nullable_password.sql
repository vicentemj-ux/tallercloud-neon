-- Usuarios que solo inician sesión con OAuth (Google) no tienen contraseña local.
ALTER TABLE taller_users
  ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON COLUMN taller_users.password_hash IS
  'Hash bcrypt; NULL si el acceso es solo OAuth (Google).';
