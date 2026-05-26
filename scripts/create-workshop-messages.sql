-- Tabla de mensajes internos del taller
create table if not exists workshop_messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  sender_id uuid not null references taller_users(id) on delete cascade,
  taller_id uuid not null references taller_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_workshop_messages_taller_created
  on workshop_messages (taller_id, created_at desc);

