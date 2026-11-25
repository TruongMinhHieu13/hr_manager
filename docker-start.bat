@echo off
chcp 65001 >nul
echo ========================================================
echo   KHỞI ĐỘNG HỆ THỐNG QUẢN LÝ NHÂN SỰ BẰNG DOCKER
echo ========================================================
echo.
echo Đang kiểm tra Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [LỖI] Docker chưa được khởi động hoặc chưa được cài đặt.
    echo Vui lòng bật Docker Desktop trước khi chạy file này.
    pause
    exit /b 1
)

echo Đang build và khởi động các container (PostgreSQL + App)...
docker compose up -d --build

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   KHỞI ĐỘNG THÀNH CÔNG!
    echo   Truy cập ứng dụng tại: http://localhost:5000
    echo ========================================================
) else (
    echo.
    echo [LỖI] Khởi động thất bại. Vui lòng kiểm tra lại log.
)
echo.
pause
