import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes.js';
import { initTables, pool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.argv[2] || process.env.PORT || 5000;

// Middleware
app.use(cors());
// Cho phép payload JSON lớn đến 50MB (đáp ứng ảnh thẻ dạng base64 khi import/chụp ảnh)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware chống cache cho toàn bộ file mẫu (Excel, CSV, Word) và HTML
const setNoCacheHeaders = (res, filePath) => {
  const lower = (filePath || '').toLowerCase();
  if (
    lower.endsWith('.html') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.docx') ||
    lower.includes('template')
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
};

// Static files (Templates & Assets)
app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: setNoCacheHeaders }));
app.use(express.static(path.join(__dirname, '..', 'dist'), { setHeaders: setNoCacheHeaders }));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW() AS now');
    res.json({
      status: 'ok',
      database: 'connected',
      dbTime: dbTest.rows[0].now,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// API Routes
app.use('/api', apiRouter);

// SPA Fallback: Trả về index.html cho các route phía frontend (React SPA)
// Luôn cấm cache index.html để đảm bảo trình duyệt luôn tải file JavaScript / CSS mới nhất sau mỗi bản cập nhật
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Khởi chạy server và kết nối Database
async function startServer() {
  try {
    console.log('[Server] Đang kết nối PostgreSQL và khởi tạo bảng...');
    await initTables();
    console.log('[Server] Kết nối PostgreSQL thành công!');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(`[Backend Server] Chạy tại: http://localhost:${PORT}`);
      console.log(`[PostgreSQL DB] Đã sẵn sàng phục vụ dữ liệu`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('[Server] Không thể khởi động do lỗi cơ sở dữ liệu:');
    console.error(err);
    process.exit(1);
  }
}

startServer();
