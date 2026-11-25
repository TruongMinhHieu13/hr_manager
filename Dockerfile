# ==============================================================================
# GIAI ĐOẠN 1: BUILD FRONTEND (Vite React + TypeScript + Tailwind)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Sao chép file cấu hình dependency
COPY package*.json ./

# Cài đặt toàn bộ dependencies (bao gồm cả devDependencies để build Vite)
RUN npm install

# Sao chép toàn bộ mã nguồn vào image build
COPY . .

# Build ứng dụng frontend sang thư mục dist
RUN npm run build

# ==============================================================================
# GIAI ĐOẠN 2: RUNTIME CHẠY ỨNG DỤNG (Production Container siêu nhẹ)
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Thiết lập biến môi trường chuẩn production
ENV NODE_ENV=production
ENV PORT=5000

# Chỉ cài đặt dependencies cần thiết cho runtime (loại bỏ devDependencies)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Sao chép mã nguồn backend
COPY server/ ./server/

# Sao chép tài nguyên tĩnh (assets, templates mẫu)
COPY public/ ./public/

# Sao chép thư mục dist đã được build tối ưu từ Giai đoạn 1
COPY --from=builder /app/dist ./dist

# Mở cổng 5000 cho ứng dụng
EXPOSE 5000

# Kiểm tra tình trạng sức khỏe ứng dụng định kỳ
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Khởi chạy máy chủ Express phục vụ cả Backend API và Frontend SPA
CMD ["node", "server/index.js"]
