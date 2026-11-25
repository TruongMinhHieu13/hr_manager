@echo off
chcp 65001 > nul
title He Thong Quan Ly & In The Nhan Vien VietSun (Che Do Lap Trinh - Dev)

set LOCAL_IP=127.0.0.1
for /f %%i in ('node scripts\get-ip.cjs') do set LOCAL_IP=%%i

echo ===================================================================
echo   HE THONG QUAN LY VA IN THE NHAN VIEN VIETSUN DONG NAI
echo   CHE DO LAP TRINH (DEV) - CO HOT RELOAD KHI SUA CODE
echo   - Frontend Web (May nay): http://localhost:3000
echo   - Backend API Dev:        http://localhost:5001
echo   - Co so du lieu:          PostgreSQL (Port 5432 / Database: hr_manager)
echo ===================================================================
echo Dang khoi chay he thong Dev, vui long cho...
echo.
call npm.cmd run dev
pause
