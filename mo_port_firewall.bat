@echo off
chcp 65001 >nul
echo ========================================================
echo   MỞ CỔNG 5000 ĐỂ CÁC MÁY CÙNG WI-FI TRUY CẬP DOCKER
echo ========================================================
echo.

:: Kiểm tra quyền Admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [LƯU Ý] Bạn cần chạy file này với quyền Administrator!
    echo Hãy nhấp chuột phải vào file này và chọn "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo Đang cấu hình tường lửa Windows Defender Firewall...
netsh advfirewall firewall delete rule name="HR Manager Docker (Port 5000)" >nul 2>&1
netsh advfirewall firewall add rule name="HR Manager Docker (Port 5000)" dir=in action=allow protocol=TCP localport=5000

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   ĐÃ MỞ CỔNG 5000 THÀNH CÔNG!
    echo.
    echo   Đường link để các máy/điện thoại cùng Wi-Fi truy cập:
    echo   👉 http://10.60.11.220:5000
    echo ========================================================
) else (
    echo [LỖI] Không thể tạo quy tắc tường lửa.
)

echo.
pause
