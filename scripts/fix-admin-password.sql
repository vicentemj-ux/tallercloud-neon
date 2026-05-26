-- IMPORTANT: Replace ADMIN_EMAIL and ADMIN_PASSWORD_HASH before running.
-- Generate hash: node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD',12).then(console.log)"
UPDATE public.taller_users
SET password_hash = 'ADMIN_PASSWORD_HASH'
WHERE email = 'ADMIN_EMAIL';
