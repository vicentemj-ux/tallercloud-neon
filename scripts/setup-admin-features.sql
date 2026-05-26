-- Add subscription and admin features to taller_users
ALTER TABLE taller_users
ADD COLUMN IF NOT EXISTS plan_tipo VARCHAR(20) DEFAULT 'Prueba' CHECK (plan_tipo IN ('Prueba', 'Premium')),
ADD COLUMN IF NOT EXISTS fecha_vencimiento_plan TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
ADD COLUMN IF NOT EXISTS es_admin BOOLEAN DEFAULT FALSE;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_plan_tipo ON taller_users(plan_tipo);
CREATE INDEX IF NOT EXISTS idx_fecha_vencimiento ON taller_users(fecha_vencimiento_plan);
CREATE INDEX IF NOT EXISTS idx_es_admin ON taller_users(es_admin);
