-- Create super admin user for TallerCloud
-- IMPORTANT: Replace ADMIN_EMAIL and ADMIN_PASSWORD_HASH before running.
-- Generate hash: node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD',12).then(console.log)"

INSERT INTO public.taller_users (
  nombre_propietario,
  nombre_taller,
  email,
  password_hash,
  email_verified,
  es_admin,
  plan_tipo,
  fecha_vencimiento_plan,
  activo,
  created_at,
  updated_at
) VALUES (
  'Admin',
  'TallerCloud Admin',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD_HASH',
  true,
  true,
  'Premium',
  '2099-12-31'::timestamp,
  true,
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  es_admin = true,
  email_verified = true,
  plan_tipo = 'Premium'
;
