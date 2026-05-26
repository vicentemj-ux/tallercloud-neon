-- Tabla de sesiones de caja
create table if not exists cash_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references taller_users(id) on delete set null,
  workshop_id uuid not null,
  opening_amount numeric(12, 2) not null,
  closing_amount numeric(12, 2),
  expected_amount numeric(12, 2),
  status text not null check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_notes text
);

create index if not exists idx_cash_sessions_workshop_status
  on cash_sessions (workshop_id, status);

-- Tabla de transacciones ligadas a la sesión de caja
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions(id) on delete cascade,
  amount numeric(12, 2) not null,
  payment_method text not null, -- efectivo, tarjeta, transferencia
  type text not null check (type in ('ingreso', 'egreso')),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_session
  on transactions (session_id, created_at);

