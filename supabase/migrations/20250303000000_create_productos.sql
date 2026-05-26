-- TallerCloud: tabla productos para el módulo de Inventario
-- Multi-tenant por taller_id (taller_users = CDSE/Reparatech, etc.)

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references taller_users(id) on delete cascade,
  nombre text not null,
  sku text,
  codigo_barras text,
  imagen_url text,
  costo numeric not null default 0,
  precio_venta numeric not null default 0,
  stock_actual int not null default 1,
  stock_minimo int not null default 5,
  es_equipo boolean not null default false,
  imei_serie text,
  color text,
  created_at timestamptz not null default now()
);

-- Índices para consultas por taller y búsquedas
create index idx_productos_taller_id on productos(taller_id);
create index idx_productos_nombre on productos(taller_id, nombre);
create index idx_productos_created_at on productos(taller_id, created_at desc);

-- SKU único por taller (varios NULL permitidos)
create unique index idx_productos_taller_sku on productos(taller_id, sku)
  where sku is not null;

-- Código de barras único por taller (varios NULL permitidos)
create unique index idx_productos_taller_codigo_barras on productos(taller_id, codigo_barras)
  where codigo_barras is not null;

-- Comentarios para documentación
comment on table productos is 'Productos del inventario por taller (TallerCloud)';
comment on column productos.taller_id is 'Tenant: referencia a taller_users';
comment on column productos.stock_minimo is 'Umbral para alertas de reabastecimiento';
comment on column productos.es_equipo is 'Si true, se usan imei_serie y color';
