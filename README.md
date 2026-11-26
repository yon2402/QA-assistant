# Asistente Inteligente para el Diseño y Planificación de Pruebas de Software

Primera versión funcional (MVP) de la plataforma descrita en la propuesta de
proyecto: un asistente que usa IA generativa como apoyo al analista de QA para
interpretar Historias de Usuario y generar, de forma estructurada, resúmenes,
escenarios, casos de prueba, datos sintéticos, análisis de riesgo, priorización,
matriz de trazabilidad y recomendaciones de automatización.

## Alcance de esta versión

Se implementó el **flujo principal de extremo a extremo**:

- Autenticación con JWT. La plataforma es exclusiva para analistas de QA, así que
  usa un único rol (QA): todos los usuarios ven las mismas funcionalidades.
- Registro, consulta y edición de Historias de Usuario. El flujo principal es
  **solo título + documento de soporte** (PDF, DOCX o TXT, máx. 10 MB): la
  aplicación extrae el texto del documento y deriva automáticamente Módulo,
  Descripción y Criterios de aceptación (ver "Extracción automática de
  documentos" más abajo). Completar esos campos a mano sigue siendo posible
  para quien no tenga documento o quiera sobrescribir lo detectado.
- Generación asistida por IA (RF-05 a RF-12): resumen, escenarios clasificados,
  casos de prueba estructurados con datos sintéticos, riesgo y prioridad
  justificados, recomendación de automatización, y matriz de trazabilidad.
- Edición manual de cualquier artefacto generado antes de exportarlo, y registro
  manual del resultado de ejecución de un caso (pendiente/aprobado/fallido).
- Exportación de resultados a CSV y PDF.
- Dashboard con métricas básicas (historias, análisis, casos, riesgo alto/crítico,
  distribución por prioridad, tiempo estimado total), filtrable por una sola
  Historia de Usuario (documento) o como resumen global de todas.
- Registro de auditoría de las acciones relevantes (login, creación/edición de
  HU, análisis ejecutados, ediciones de casos), visible para todos los usuarios.

Quedan para una siguiente iteración (no bloquean el uso del flujo principal):
exportación a Excel, historial de análisis más elaborado, gestión de usuarios
desde la interfaz (hoy se crean con el script de seed o el endpoint de
registro), y la conexión a un proveedor de IA real (ver más abajo).

## Decisiones técnicas y una adaptación importante

La propuesta documenta la base de datos como "PostgreSQL accedida mediante
Prisma ORM". **En este entorno de construcción no fue posible instalar el
motor binario de Prisma** (la descarga desde `binaries.prisma.sh` está
bloqueada por la política de red del entorno en el que se generó este
proyecto), así que la capa de acceso a datos se implementó con el driver
`pg` (PostgreSQL) y SQL parametrizado directo (`backend/sql/schema.sql` +
`backend/src/database/`), conservando exactamente las mismas tablas, tipos y
relaciones que se habrían definido en un `schema.prisma`. Si en tu propia
máquina tienes acceso normal a internet, migrar a Prisma más adelante es
sencillo porque el modelo de datos ya está completamente definido; no es un
requisito para que la aplicación funcione.

El resto de la arquitectura sigue lo documentado: React 18 + TypeScript en el
frontend, NestJS + TypeScript en el backend, JWT para autenticación (un único rol: QA), y un
LLM Gateway desacoplado del resto del sistema.

## LLM Gateway (generación asistida por IA)

Por defecto, el LLM Gateway usa un **proveedor simulado**
(`backend/src/llm-gateway/mock-llm.provider.ts`): genera una respuesta
estructurada y realista a partir de reglas simples sobre el texto de la HU,
sin llamar a ningún servicio externo ni requerir una clave de API. Esto
permite usar y demostrar la aplicación completa sin costo y sin conexión a
internet.

El mock no se limita a un número fijo de casos: separa el texto de
"Criterios de aceptación" en puntos individuales (numerados, por línea, en
formato Gherkin "Dado/Cuando/Entonces", o por oraciones si no hay
enumeración) y genera **un caso de prueba específico por cada criterio**,
además de 6 casos de cobertura general (positivo, negativo, límite,
validación, seguridad, integración). Cada caso incluye además un **tiempo
estimado de ejecución manual en minutos**, y el análisis completo muestra el
tiempo total estimado (también visible en el Dashboard, sumado entre todos
los análisis).

## Extracción automática de documentos

Al subir un documento de soporte (PDF, DOCX o TXT), `backend/src/historias/document-extractor.ts`
extrae su texto (con `pdf-parse` y `mammoth`, ambos puro JavaScript, sin
binarios nativos) y busca en él las etiquetas típicas de una especificación
de Historia de Usuario (`Módulo:`, `Historia:`/`Descripción:`,
`Criterios de aceptación:`). Si el documento describe varias Historias de
Usuario (por ejemplo la especificación completa de un módulo), se
concatenan todas las secciones encontradas, de modo que una sola carga
alimenta la generación de casos de prueba de todo el contenido, no solo del
primer bloque. Si no se reconoce ninguna etiqueta, se usa el documento
completo como fuente de criterios de aceptación, para que el LLM Gateway
pueda extraer de ahí todo lo que sea posible. Lo que el usuario escriba a
mano siempre tiene prioridad sobre lo detectado automáticamente.

Para conectar un proveedor real (OpenAI, Anthropic, etc.) más adelante:

1. Crea una clase que implemente la interfaz `LlmProvider`
   (`backend/src/llm-gateway/llm-provider.interface.ts`).
2. Regístrala en `backend/src/llm-gateway/llm-gateway.module.ts` según la
   variable de entorno `LLM_PROVIDER`.
3. Añade tu clave de API en `.env` (nunca la subas a un repositorio público).

Ningún otro módulo del sistema necesita cambiar, ya que todos dependen de la
interfaz `LlmProvider`, no de una implementación concreta.

## Cómo ejecutar el proyecto

### Opción rápida (Windows): un solo archivo

Haz doble clic en **`INICIAR-APLICACION.bat`** (en la raíz de este proyecto).
Ese archivo, sin que tengas que escribir ningún comando:

1. Verifica que tengas Node.js y Docker instalados.
2. Crea los archivos `.env` de backend/frontend si no existen.
3. Levanta la base de datos PostgreSQL con Docker.
4. Instala las dependencias de backend y frontend (`npm install`).
5. Aplica las migraciones de base de datos y crea los usuarios de ejemplo.
6. Arranca el backend y el frontend, cada uno en su propia ventana.
7. Abre la aplicación en tu navegador (`http://localhost:5173`).

La primera vez puede tardar varios minutos (está instalando todo); las
siguientes veces es mucho más rápido, y es seguro volver a ejecutarlo
cuantas veces quieras (no duplica nada ni rompe datos existentes). Deja
abiertas las dos ventanas negras "QA Assistant - Backend" y "QA Assistant -
Frontend" mientras uses la aplicación.

Si en algún momento solo necesitas re-aplicar un cambio de base de datos,
usa `ACTUALIZAR-BD.bat`.

### Opción manual (paso a paso, o en Mac/Linux)

### 1. Base de datos

Necesitas PostgreSQL 14+ corriendo en tu máquina. La forma más simple es con
Docker:

```bash
docker compose up -d
```

(o usa una instalación local de PostgreSQL y ajusta `DATABASE_URL` en el
siguiente paso).

### 2. Backend

```bash
cd backend
cp .env.example .env     # ajusta DATABASE_URL/JWT_SECRET si lo necesitas
npm install
npm run db:migrate       # crea las tablas
npm run db:seed          # crea el usuario de ejemplo
npm run start:dev        # http://localhost:3000
```

Usuario de ejemplo creado por el seed: `qa@thomasinstruments.test`, contraseña
`Password123!`.

Pruebas automatizadas del backend: `npm test` (Jest).

### 3. Frontend

```bash
cd frontend
cp .env.example .env     # por defecto apunta a http://localhost:3000
npm install
npm run dev               # http://localhost:5173
```

Inicia sesión con el usuario de ejemplo y sigue el flujo:
**Historias de Usuario → Nueva Historia de Usuario → Ver / Analizar → Analizar
con IA**.

## Estructura del proyecto

```
backend/
  sql/schema.sql          Esquema de base de datos (tablas, tipos, índices)
  src/
    database/             Acceso a datos (pg.Pool) + migrate.ts + seed.ts
    auth/                 JWT y guard de autenticación (RF-01)
    users/                Usuarios
    historias/             Historias de Usuario (RF-02, RF-03, RF-04)
    llm-gateway/            Interfaz LlmProvider + proveedor simulado
    analisis/               Orquesta la generación IA y persiste el resultado (RF-05 a RF-15, RF-17)
    export/                 Exportación a CSV/PDF (RF-16)
    audit/                  Registro de auditoría (RF-18, RNF-09)
frontend/
  src/
    api/                   Cliente HTTP (axios) con JWT automático
    context/AuthContext    Sesión del usuario
    pages/                 Login, Historias, Detalle de HU, Dashboard, Auditoría
    components/            Navbar, tarjeta de caso de prueba editable
docker-compose.yml         PostgreSQL para desarrollo local
```

## Seguridad (alineado con RNF-01, RNF-02, RNF-11)

- Contraseñas con hash `bcrypt`, tokens JWT con expiración configurable.
- Todos los endpoints (salvo inicio de sesión) exigen un token JWT válido.
- Validación de entrada con `class-validator` en todos los DTO.
- Validación de tipo y tamaño de archivos antes de guardarlos.
- Todos los datos de ejemplo (usuarios, Historias de Usuario) son ficticios;
  no se usa información real de Thomas Instruments en ningún punto.
