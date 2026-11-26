-- Esquema de base de datos del Asistente Inteligente para el Diseño y Planificación
-- de Pruebas de Software. Cubre las entidades necesarias para RF-01 a RF-18.
-- Aplicado con: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE role_enum AS ENUM ('QA', 'QA_LEAD', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prioridad_enum AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAJA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE riesgo_enum AS ENUM ('BAJO', 'MEDIO', 'ALTO', 'CRITICO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_ejecucion_enum AS ENUM ('PENDIENTE', 'APROBADO', 'FALLIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RF-01: autenticación. La plataforma es exclusiva para analistas de QA y
-- usa un único rol ('QA'). Los valores QA_LEAD y ADMIN del tipo se conservan
-- solo por compatibilidad con bases de datos creadas en versiones anteriores.
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           role_enum NOT NULL DEFAULT 'QA',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unificación de roles: todos los usuarios existentes pasan a ser QA.
UPDATE users SET role = 'QA' WHERE role <> 'QA';

-- RF-02, RF-03, RF-04: Historias de Usuario con documento de soporte opcional
CREATE TABLE IF NOT EXISTS historias_usuario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo                TEXT NOT NULL,
  descripcion           TEXT NOT NULL,
  modulo                TEXT NOT NULL,
  criterios_aceptacion  TEXT NOT NULL,
  reglas_de_negocio     TEXT,
  prioridad_negocio     TEXT,
  dependencias          TEXT,
  info_adicional        TEXT,
  archivo_nombre        TEXT,
  archivo_tipo          TEXT,
  archivo_tamano        INTEGER,
  archivo_ruta          TEXT,
  contenido_extraido    TEXT,
  created_by_id         UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibilidad con bases de datos creadas antes de este campo (texto
-- completo extraído del documento de soporte, usado para derivar Módulo /
-- Descripción / Criterios de aceptación automáticamente).
ALTER TABLE historias_usuario ADD COLUMN IF NOT EXISTS contenido_extraido TEXT;

-- RF-05 a RF-12: resultado de la generación asistida por IA para una HU
CREATE TABLE IF NOT EXISTS analisis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  historia_id          UUID NOT NULL REFERENCES historias_usuario(id) ON DELETE CASCADE,
  resumen              TEXT NOT NULL,
  editado_manualmente  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RF-06: escenarios de prueba clasificados
CREATE TABLE IF NOT EXISTS escenarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id  UUID NOT NULL REFERENCES analisis(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,
  descripcion  TEXT NOT NULL
);

-- RF-07, RF-08, RF-09, RF-10, RF-11, RF-15, RF-17
CREATE TABLE IF NOT EXISTS casos_prueba (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id                     UUID NOT NULL REFERENCES analisis(id) ON DELETE CASCADE,
  escenario_id                    UUID REFERENCES escenarios(id) ON DELETE SET NULL,
  codigo                          TEXT NOT NULL,
  nombre                          TEXT NOT NULL,
  objetivo                        TEXT NOT NULL,
  precondiciones                  TEXT NOT NULL,
  datos_prueba                    TEXT NOT NULL,
  pasos                           TEXT NOT NULL,
  resultado_esperado              TEXT NOT NULL,
  riesgo                          riesgo_enum NOT NULL DEFAULT 'MEDIO',
  riesgo_justificacion            TEXT,
  prioridad                       prioridad_enum NOT NULL DEFAULT 'MEDIA',
  prioridad_justificacion         TEXT,
  automatizable                   TEXT,
  herramienta_sugerida            TEXT,
  criterio_aceptacion_relacionado TEXT,
  resultado_ejecucion             estado_ejecucion_enum NOT NULL DEFAULT 'PENDIENTE',
  tiempo_estimado_minutos         INTEGER NOT NULL DEFAULT 15,
  editado_manualmente             BOOLEAN NOT NULL DEFAULT false,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibilidad con bases de datos creadas antes de este campo.
ALTER TABLE casos_prueba ADD COLUMN IF NOT EXISTS tiempo_estimado_minutos INTEGER NOT NULL DEFAULT 15;
ALTER TABLE analisis ADD COLUMN IF NOT EXISTS tiempo_estimado_total_minutos INTEGER NOT NULL DEFAULT 0;

-- RF-12: matriz de trazabilidad
CREATE TABLE IF NOT EXISTS matriz_trazabilidad (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id          UUID NOT NULL REFERENCES analisis(id) ON DELETE CASCADE,
  criterio_aceptacion  TEXT NOT NULL,
  escenario            TEXT NOT NULL,
  caso_prueba_codigo   TEXT NOT NULL,
  prioridad            prioridad_enum NOT NULL
);

-- RF-18: registro de auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  accion      TEXT NOT NULL,
  entidad     TEXT NOT NULL,
  entidad_id  TEXT,
  detalle     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historias_created_by ON historias_usuario(created_by_id);
CREATE INDEX IF NOT EXISTS idx_analisis_historia ON analisis(historia_id);
CREATE INDEX IF NOT EXISTS idx_casos_analisis ON casos_prueba(analisis_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
