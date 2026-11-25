@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo ========================================================
echo   CẬP NHẬT CHỨC NĂNG MỚI CHO DOCKER
echo ========================================================
echo.
echo Đang build lại ứng dụng với code mới nhất...
docker compose up -d --build app

if errorlevel 1 goto ERROR

echo.
echo ========================================================
echo   CẬP NHẬT THÀNH CÔNG!
echo   - Dữ liệu database được giữ nguyên 100%%.
echo   - Toàn bộ code chức năng mới đã được nạp vào Docker.
echo.
echo   Hãy mở trình duyệt và nhấn Ctrl + F5 để nạp giao diện mới!
echo   👉 http://localhost:5000 (hoặc qua IP Wi-Fi)
echo ========================================================
goto END

:ERROR
echo.
echo [LỖI] Quá trình cập nhật thất bại.
echo Vui lòng đảm bảo Docker Desktop đang chạy và thử lại.

:END
echo.
pause
