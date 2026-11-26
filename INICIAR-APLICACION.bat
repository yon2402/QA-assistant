@echo off
setlocal
cd /d "%~dp0"
title Asistente IA de Pruebas - Inicio automatico

echo ============================================================
echo   Asistente IA de Pruebas - Inicio automatico
echo ============================================================
echo.
echo Este script revisa/instala todo lo necesario y deja la
echo aplicacion funcionando. La primera vez puede tardar varios
echo minutos (instala dependencias). Las siguientes veces es
echo mucho mas rapido.
echo.

REM ------------------------------------------------------------
REM 0) Verificar que Node.js y Docker esten instalados
REM ------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js instalado en este equipo.
  echo Instala Node.js ^(https://nodejs.org^) y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Docker instalado en este equipo.
  echo Instala Docker Desktop ^(https://www.docker.com/products/docker-desktop^)
  echo y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

REM ------------------------------------------------------------
REM 1) Archivos de configuracion (solo si no existen ya)
REM ------------------------------------------------------------
if not exist "backend\.env" (
  echo Creando backend\.env ...
  copy /y "backend\.env.example" "backend\.env" >nul
)
if not exist "frontend\.env" (
  echo Creando frontend\.env ...
  copy /y "frontend\.env.example" "frontend\.env" >nul
)

REM ------------------------------------------------------------
REM 2) Base de datos PostgreSQL vía Docker
REM ------------------------------------------------------------
echo.
echo Iniciando base de datos (Docker)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo [AVISO] Docker no respondio. Abre Docker Desktop manualmente,
  echo espera a que inicie por completo y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

echo Esperando a que la base de datos este lista...
timeout /t 8 /nobreak >nul

REM ------------------------------------------------------------
REM 3) Backend: dependencias + migracion + usuarios de ejemplo
REM ------------------------------------------------------------
echo.
echo Preparando el backend...
pushd backend
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo [ERROR] Fallo la instalacion de dependencias del backend.
  popd
  pause
  exit /b 1
)
call npm run db:migrate
call npm run db:seed
popd

REM ------------------------------------------------------------
REM 4) Frontend: dependencias
REM ------------------------------------------------------------
echo.
echo Preparando el frontend...
pushd frontend
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo [ERROR] Fallo la instalacion de dependencias del frontend.
  popd
  pause
  exit /b 1
)
popd

REM ------------------------------------------------------------
REM 5) Arrancar backend y frontend (si no estan corriendo ya)
REM ------------------------------------------------------------
echo.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Iniciando backend en http://localhost:3000 ...
  start "QA Assistant - Backend" cmd /k "cd /d "%~dp0backend" && npm run start:dev"
) else (
  echo El backend ya estaba corriendo en el puerto 3000.
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Iniciando frontend en http://localhost:5173 ...
  start "QA Assistant - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
) else (
  echo El frontend ya estaba corriendo en el puerto 5173.
)

REM ------------------------------------------------------------
REM 6) Abrir el navegador
REM ------------------------------------------------------------
echo.
echo Esperando a que los servidores terminen de arrancar...
timeout /t 12 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo ============================================================
echo   Listo. La aplicacion deberia abrirse sola en tu navegador.
echo   Si no se abre, entra manualmente a: http://localhost:5173
echo.
echo   Usuario de prueba:  qa@thomasinstruments.test
echo   Contrasena:         Password123!
echo ============================================================
echo.
echo No cierres las dos ventanas negras tituladas "QA Assistant -
echo Backend" y "QA Assistant - Frontend": deben quedar abiertas
echo mientras uses la aplicacion. Esta ventana si la puedes cerrar.
echo.
pause
