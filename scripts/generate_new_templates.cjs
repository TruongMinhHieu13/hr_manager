const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

// The new 51-column CSV template provided in the request
const csvContent = `DANH SÁCH CÁN BỘ CÔNG NHÂN VIÊN,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
STT,ĐƠN VỊ,Tình trạng,KHỐI,KÝ HIỆU PB,PHÒNG BAN,PHÒNG BAN CON,MSNV,HỌ,TÊN,CÔNG VIỆC,NGÀY VÀO,NGÀY SINH,NƠI SINH,NGUYÊN QUÁN,NAM,NỮ,DÂN TỘC,TÔN GIÁO,THƯỜNG TRÚ,,,THƯỜNG TRÚ,TẠM TRÚ,,,CCCD,NGÀY CẤP,NƠI CẤP,NGÀY HẾT HẠN,TRÌNH ĐỘ VĂN HÓA,TRÌNH ĐỘ CHUYÊN MÔN,SỐ CMND CŨ,TRÌNH ĐỘ NGOẠI NGỮ,TAY NGHỀ,ĐÀO TẠO,SỐ ĐIỆN THOẠI,TÌNH TRẠNG HÔN NHÂN,,SỨC KHỎE,GIỚI THIỆU,BỘ PHẬN,Loại HĐ,Thời hạn,Phân Loại,Số HĐ,Từ ngày,Đến ngày,,Khối,Chức vụ
,,,,,,,,,,,,,,,,,,,SỐ NHÀ,PHƯỜNG XÃ,TỈNH/TP,ĐỊA CHỈ ĐẦY ĐỦ,SỐ NHÀ,PHƯỜNG XÃ,TỈNH/TP,,,,,,,,,,,,ĐÃ KẾT HÔN,ĐỘC THÂN,,,,,,,,,,,,
No,Donvi3,Tinhtrang4,,Tinhtrang5,Bophan5,Bophancon6,Manhanvien2222,Ho,Ten,Congviec,Ngayvaocty,Ngaysinh,Noisinh,Nguyenquan,Column7,Gioitinhnu,Dantoc,Tongiao,Sonha,Phuongxa,Tinh,Diachithuongtru,Sonha8,Phuongxa9,Tinh11,CCCD,Ngaycap,Noicap,Ngay hethan,Tdvanhoa,Tdchuyenmon,Scmndc,Tdngoaingu,Taynghe,Daotao,Sodienthoai,Dakethon,docthan,Column12,,Column13,Column15,Column16,Column17,Column18,Column19,Column20,,,`;

async function generate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VietSun HR';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('DanhSachNhanVien', {
    views: [{ showGridLines: true }],
  });

  ws.columns = [
    { key: 'stt', width: 6 },
    { key: 'donVi', width: 14 },
    { key: 'tinhTrang', width: 12 },
    { key: 'khoi', width: 14 },
    { key: 'kyHieuPb', width: 13 },
    { key: 'phongBan', width: 22 },
    { key: 'phongBanCon', width: 22 },
    { key: 'msnv', width: 13 },
    { key: 'ho', width: 20 },
    { key: 'ten', width: 12 },
    { key: 'congViec', width: 26 },
    { key: 'ngayVao', width: 14 },
    { key: 'ngaySinh', width: 14 },
    { key: 'noiSinh', width: 22 },
    { key: 'nguyenQuan', width: 22 },
    { key: 'nam', width: 7 },
    { key: 'nu', width: 7 },
    { key: 'danToc', width: 12 },
    { key: 'tonGiao', width: 14 },
    { key: 'soNhaThuongTru', width: 20 },
    { key: 'phuongXaThuongTru', width: 20 },
    { key: 'tinhTpThuongTru', width: 22 },
    { key: 'diaChiThuongTru', width: 36 },
    { key: 'soNhaTamTru', width: 20 },
    { key: 'phuongXaTamTru', width: 20 },
    { key: 'tinhTpTamTru', width: 22 },
    { key: 'cccd', width: 18 },
    { key: 'ngayCapCccd', width: 14 },
    { key: 'noiCapCccd', width: 24 },
    { key: 'ngayHetHanCccd', width: 14 },
    { key: 'trinhDoVanHoa', width: 16 },
    { key: 'trinhDoChuyenMon', width: 22 },
    { key: 'soCmndCu', width: 16 },
    { key: 'trinhDoNgoaiNgu', width: 18 },
    { key: 'tayNghe', width: 12 },
    { key: 'daoTao', width: 12 },
    { key: 'soDienThoai', width: 16 },
    { key: 'daKetHon', width: 12 },
    { key: 'docThan', width: 12 },
    { key: 'sucKhoe', width: 12 },
    { key: 'gioiThieu', width: 16 },
    { key: 'boPhan', width: 16 },
    { key: 'loaiHd', width: 14 },
    { key: 'thoiHan', width: 14 },
    { key: 'phanLoai', width: 14 },
    { key: 'soHd', width: 13 },
    { key: 'tuNgay', width: 14 },
    { key: 'denNgay', width: 14 },
    { key: 'cotTrongAW', width: 12 },
    { key: 'khoi2', width: 14 },
    { key: 'chucVu', width: 18 },
  ];

  ws.mergeCells('A1:AY2');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'DANH SÁCH CÁN BỘ CÔNG NHÂN VIÊN';
  titleCell.font = {
    name: 'Times New Roman',
    size: 15,
    bold: true,
    color: { argb: 'FF000000' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' },
  };

  ws.getRow(1).height = 26;
  ws.getRow(2).height = 26;

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  };

  const lines = csvContent.split('\n');
  const headersVn = lines[2].split(',');
  const headersSub = lines[3].split(',');
  const headersCode = lines[4].split(',');

  const row3 = ws.getRow(3);
  row3.height = 28;
  headersVn.forEach((text, idx) => {
    const cell = row3.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  const row4 = ws.getRow(4);
  row4.height = 20;
  headersSub.forEach((text, idx) => {
    const cell = row4.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  const row5 = ws.getRow(5);
  row5.height = 19;
  headersCode.forEach((text, idx) => {
    const cell = row5.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 10, italic: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // Empty data rows with borders
  for (let r = 6; r <= 15; r++) {
    const row = ws.getRow(r);
    row.height = 20;
    for (let c = 1; c <= 51; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.border = thinBorder;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();

  // Save template .xlsx to public/assets/aistudio/FileMauLamTheNV.xlsx
  fs.writeFileSync('public/assets/aistudio/FileMauLamTheNV.xlsx', buffer);
  console.log('Saved public/assets/aistudio/FileMauLamTheNV.xlsx');

  // Also save to public/templates/FileMauLamTheNV.xlsx
  fs.writeFileSync('public/templates/FileMauLamTheNV.xlsx', buffer);
  console.log('Saved public/templates/FileMauLamTheNV.xlsx');

  // Update public/assets/aistudio/FileMauLamTheNV_041f985f.csv
  fs.writeFileSync('public/assets/aistudio/FileMauLamTheNV_041f985f.csv', '\uFEFF' + csvContent, 'utf8');
  console.log('Saved public/assets/aistudio/FileMauLamTheNV_041f985f.csv');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
