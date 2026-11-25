@echo off
chcp 65001 >nul
echo ========================================================
echo   DỪNG HỆ THỐNG QUẢN LÝ NHÂN SỰ DOCKER
echo ========================================================
echo.
docker compose down
echo.
echo Đã dừng tất cả các container.
pause
