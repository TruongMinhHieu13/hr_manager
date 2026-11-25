@echo off
chcp 65001 >nul
echo ========================================================
echo   ĐỒNG BỘ CẤU TRÚC (BẢNG & CỘT) MỚI SANG DOCKER
echo   - Chỉ thêm bảng mới và cột mới
echo   - TUYỆT ĐỐI KHÔNG COPY DỮ LIỆU
echo   - BẢO TOÀN NGUYÊN VẸN 100% DỮ LIỆU TRÊN DOCKER
echo ========================================================
echo.
node scripts\sync_schema_only.cjs
echo.
pause
