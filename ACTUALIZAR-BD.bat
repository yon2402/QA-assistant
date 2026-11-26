@echo off
cd /d "%~dp0backend"
echo ============================================
echo   Actualizando esquema de base de datos...
echo ============================================
call npm run db:migrate
echo.
echo Listo. Puedes cerrar esta ventana.
pause
