-- Tabla de técnicos del taller
CREATE TABLE IF NOT EXISTS tecnicos (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  estatus VARCHAR(50) DEFAULT 'Activo' CHECK (estatus IN ('Activo', 'Inactivo')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de configuración del taller
CREATE TABLE IF NOT EXISTS configuracion_taller (
  id BIGSERIAL PRIMARY KEY,
  nombre_taller VARCHAR(255) DEFAULT 'Mi Taller',
  direccion TEXT,
  logo_url TEXT,
  pie_pagina TEXT,
  terminos_garantia TEXT,
  tamaño_papel VARCHAR(20) DEFAULT '80mm' CHECK (tamaño_papel IN ('80mm', '58mm')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuración por defecto
INSERT INTO configuracion_taller (nombre_taller, tamaño_papel) 
VALUES ('Mi Taller', '80mm')
ON CONFLICT DO NOTHING;
