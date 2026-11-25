const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

const rawCSV = [
  'DANH SÁCH GIẢM,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  'STT,ĐƠN VỊ,KHỐI,PHÒNG BAN,PHÒNG BAN,PHÒNG BAN CON,MSNV ,HỌ,TÊN,CÔNG VIỆC,NGÀY VÀO CÔNG TY,NGÀY NGHỈ VIỆC,NGÀY HẸN TRẢ LƯƠNG,LÝ DO NV,,,,,THÁNG BÁO CÁO,NGÀY SINH,NƠI SINH,NGUYÊN QUÁN,GIỚI TÍNH,,DÂN TỘC,TÔN GIÁO,THƯỜNG TRÚ,SỐ CCCD,NGÀY CẤP,NƠI CẤP,SỐ ĐIỆN THOẠI',
  ',,,,,,,,,,,,,CHO THÔI VIÊC,BỎ VIỆC,ĐƠN PHƯƠNG CDHĐLD,DUYET THEO DON,KY LUAT,,,,,NAM,NỮ,,,,,,,',
  'No,Donvi,,,Bophan,Bophancon,Manhanvien,Ho,Ten,Congviec,Ngayvao,Ngaynghi,,Chonghiviec,Tunghiviec,Donphuong,Duyettheodon,Kyluatld,Thangbaocao,Ngaysinh,noisinh,Nguyenquan,Gioitinhnam,Gioitinhnu,Dantoc,Tongiao,Diachithuongtru,CCCD,Ngaycap,Noicap,Sodienthoai'
].join('\r\n');

// Đảm bảo thư mục public/templates tồn tại
const publicTemplatesDir = path.join(__dirname, '..', 'public', 'templates');
if (!fs.existsSync(publicTemplatesDir)) {
  fs.mkdirSync(publicTemplatesDir, { recursive: true });
}

// Lưu file CSV nguyên bản
fs.writeFileSync(path.join(publicTemplatesDir, 'Mau_Danh_Sach_Giam.csv'), '\uFEFF' + rawCSV, 'utf8');

// Parse ra sheet
const wb = XLSX.read(rawCSV, { type: 'string' });
const ws = wb.Sheets[wb.SheetNames[0]];

// Định dạng độ rộng cột
ws['!cols'] = [
  { wch: 6 },  // STT
  { wch: 38 }, // ĐƠN VỊ
  { wch: 14 }, // KHỐI
  { wch: 16 }, // PHÒNG BAN
  { wch: 16 }, // PHÒNG BAN
  { wch: 16 }, // PHÒNG BAN CON
  { wch: 14 }, // MSNV
  { wch: 18 }, // HỌ
  { wch: 12 }, // TÊN
  { wch: 20 }, // CÔNG VIỆC
  { wch: 14 }, // NGÀY VÀO CÔNG TY
  { wch: 15 }, // NGÀY NGHỈ VIỆC
  { wch: 18 }, // NGÀY HẸN TRẢ LƯƠNG
  { wch: 14 }, // CHO THÔI VIỆC
  { wch: 12 }, // BỎ VIỆC
  { wch: 18 }, // ĐƠN PHƯƠNG CDHĐLD
  { wch: 16 }, // DUYỆT THEO ĐƠN
  { wch: 12 }, // KỶ LUẬT
  { wch: 15 }, // THÁNG BÁO CÁO
  { wch: 14 }, // NGÀY SINH
  { wch: 15 }, // NƠI SINH
  { wch: 15 }, // NGUYÊN QUÁN
  { wch: 8 },  // NAM
  { wch: 8 },  // NỮ
  { wch: 12 }, // DÂN TỘC
  { wch: 12 }, // TÔN GIÁO
  { wch: 26 }, // THƯỜNG TRÚ
  { wch: 16 }, // SỐ CCCD
  { wch: 14 }, // NGÀY CẤP
  { wch: 22 }, // NƠI CẤP
  { wch: 15 }, // SỐ ĐIỆN THOẠI
];

const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, ws, 'DANH SÁCH GIẢM');

const outXlsxPath = path.join(publicTemplatesDir, 'Mau_Danh_Sach_Giam.xlsx');
XLSX.writeFile(outWb, outXlsxPath);

// Copy sang thư mục public/ và dist/templates nếu có
const rootPublicXlsx = path.join(__dirname, '..', 'public', 'Mau_Danh_Sach_Giam.xlsx');
fs.copyFileSync(outXlsxPath, rootPublicXlsx);

const distTemplatesDir = path.join(__dirname, '..', 'dist', 'templates');
if (fs.existsSync(path.join(__dirname, '..', 'dist'))) {
  if (!fs.existsSync(distTemplatesDir)) {
    fs.mkdirSync(distTemplatesDir, { recursive: true });
  }
  fs.copyFileSync(outXlsxPath, path.join(distTemplatesDir, 'Mau_Danh_Sach_Giam.xlsx'));
  fs.copyFileSync(path.join(publicTemplatesDir, 'Mau_Danh_Sach_Giam.csv'), path.join(distTemplatesDir, 'Mau_Danh_Sach_Giam.csv'));
}

console.log('Successfully created Mau_Danh_Sach_Giam.xlsx and .csv at:', outXlsxPath);
