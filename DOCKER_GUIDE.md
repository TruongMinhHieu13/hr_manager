# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG BẰNG DOCKER

Hệ thống Quản lý Nhân sự (VietSun HR) đã được đóng gói hoàn chỉnh bằng Docker và Docker Compose theo mô hình Multi-stage build tối ưu kích thước, bảo mật và hiệu năng.

---

## 1. Cấu trúc đóng gói

- **`Dockerfile`**: 
  - **Stage 1 (Builder)**: Sử dụng `node:20-alpine`, tự động build toàn bộ Frontend (Vite + React 19 + TypeScript + Tailwind CSS) thành thư mục tĩnh `/app/dist`.
  - **Stage 2 (Runner)**: Sử dụng `node:20-alpine`, chỉ cài đặt dependencies chạy production (`--omit=dev`), tích hợp Express phục vụ cả Backend API và Frontend SPA trên cổng **5000**, có cơ chế **Healthcheck** tự động giám sát.
- **`docker-compose.yml`**:
  - Dịch vụ **`postgres`**: Chạy PostgreSQL 16 Alpine, cấu hình volume lưu trữ bền vững `hr_postgres_data` (không bị mất dữ liệu khi restart hay xóa container).
  - Dịch vụ **`app`**: Tự động build và liên kết với PostgreSQL, tự động chờ DB sẵn sàng trước khi kết nối và tự động khởi tạo bảng (`initTables()`).
- **`.dockerignore`**: Loại bỏ `node_modules`, `dist`, `.git` và file log để quá trình build Docker nhanh nhất và image nhỏ nhất.
- **`docker-start.bat` & `docker-stop.bat`**: File script tiện ích cho người dùng Windows thao tác 1 cú nhấp chuột.

---

## 2. Hướng dẫn sử dụng

### Cách 1: Sử dụng file script tiện ích (Dành cho Windows)
- **Khởi động**: Nhấp đúp chuột vào file `docker-start.bat`. Hệ thống sẽ tự động build và chạy cả 2 container nền. Sau khi xong, mở trình duyệt truy cập:
  👉 **`http://localhost:5000`**
- **Dừng lại**: Nhấp đúp chuột vào file `docker-stop.bat`.

### Cách 2: Sử dụng lệnh Docker Compose qua Terminal / CMD

1. **Khởi động hệ thống (Build và chạy ngầm)**:
   ```bash
   docker compose up -d --build
   ```

2. **Kiểm tra trạng thái các container**:
   ```bash
   docker compose ps
   ```

3. **Xem log hoạt động theo thời gian thực**:
   ```bash
   docker compose logs -f app
   ```

4. **Dừng toàn bộ hệ thống**:
   ```bash
   docker compose down
   ```

5. **Dừng và xóa cả dữ liệu database (Cẩn thận khi dùng)**:
   ```bash
   docker compose down -v
   ```

---

## 3. Cấu hình biến môi trường

Các biến môi trường mặc định trong `docker-compose.yml`:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `5000` | Cổng truy cập ứng dụng trên trình duyệt |
| `DB_HOST` | `postgres` | Tên service database trong mạng Docker |
| `DB_PORT` | `5432` | Cổng kết nối PostgreSQL |
| `DB_USER` | `postgres` | Tài khoản quản trị DB |
| `DB_PASSWORD` | `123456` | Mật khẩu database |
| `DB_NAME` | `hr_manager` | Tên cơ sở dữ liệu nhân sự |

---

## 4. Sao lưu và phục hồi dữ liệu (Backup & Restore)

- **Sao lưu cơ sở dữ liệu**:
  ```bash
  docker compose exec -T postgres pg_dump -U postgres hr_manager > backup_hr_manager.sql
  ```

- **Phục hồi cơ sở dữ liệu từ file backup**:
  ```bash
  docker compose exec -i postgres psql -U postgres hr_manager < backup_hr_manager.sql
  ```
