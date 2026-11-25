import ExcelJS from 'exceljs';
import { VIETSUN_LOGO_BASE64 } from './vietsunLogoBase64';
import { SALARY_TEMPLATE_EXCEL_BASE64 } from './salaryTemplateBase64';

export const SALARY_IMPORT_SAMPLE_CSV = `STT,MSNV ,HỌ,TÊN,BỘ PHẬN,CÔNG VIỆC,NGÀY VÀO CÔNG TY,NGÀY SINH,NƠI SINH,NGUYÊN QUÁN,GIỚI TÍNH,,DÂN TỘC,TÔN GIÁO,THƯỜNG TRÚ,,,,THƯỜNG TRÚ,TẠM TRÚ,,,,SỐ CMND,NGÀY CẤP,NƠI CẤP,TAY NGHỀ,ĐÀO TẠO,"SỐ ĐIỆN
THOẠI","THỬ VIỆC, ĐÀO TẠO",,BẬC,NGẠCH,Lương thử vệc,Hình thức lương,Thời gian,SỐ NGÀY THỬ VIỆC,Chức vụ
,,,,,,,,,,NAM,NỮ,,,SỐ NHÀ,PHƯỜNG/XÃ,QUẬN/HUYỆN,TỈNH/TP,,SỐ NHÀ,PHƯỜNG/XÃ,QUẬN/HUYỆN,TỈNH/TP,,,,,,,TỪ NGÀY,ĐẾN NGÀY,,,,,,,`;

export const SALARY_IMPORT_HEADERS = [
  'STT', 'MSNV ', 'HỌ', 'TÊN', 'BỘ PHẬN', 'CÔNG VIỆC', 'NGÀY VÀO CÔNG TY', 'NGÀY SINH', 'NƠI SINH', 'NGUYÊN QUÁN',
  'GIỚI TÍNH', '', 'DÂN TỘC', 'TÔN GIÁO', 'THƯỜNG TRÚ', '', '', '', 'THƯỜNG TRÚ', 'TẠM TRÚ',
  '', '', '', 'SỐ CMND', 'NGÀY CẤP', 'NƠI CẤP', 'TAY NGHỀ', 'ĐÀO TẠO', 'SỐ ĐIỆN\nTHOẠI', 'THỬ VIỆC, ĐÀO TẠO',
  '', 'BẬC', 'NGẠCH', 'Lương thử vệc', 'Hình thức lương', 'Thời gian', 'SỐ NGÀY THỬ VIỆC', 'Chức vụ'
];

export const SALARY_IMPORT_SUBHEADERS = [
  '', '', '', '', '', '', '', '', '', '',
  'NAM', 'NỮ', '', '', 'SỐ NHÀ', 'PHƯỜNG/XÃ', 'QUẬN/HUYỆN', 'TỈNH/TP', '', 'SỐ NHÀ',
  'PHƯỜNG/XÃ', 'QUẬN/HUYỆN', 'TỈNH/TP', '', '', '', '', '', '', 'TỪ NGÀY',
  'ĐẾN NGÀY', '', '', '', '', '', '', ''
];

export const SALARY_IMPORT_SAMPLE_ROWS: Array<Array<string | number>> = [
  [
    '1', '90941', 'Nguyễn Thị Phương', 'Uyên', 'Chuyền may 11-02', 'Công nhân may', '15/01/2026', '20/10/1998', 'An Giang', 'An Giang',
    'x', '', 'Kinh', 'Không', '123', 'Bình Hòa', 'Thuận An', 'Bình Dương', '', '123',
    'Bình Hòa', 'Thuận An', 'Bình Dương', '089198001234', '15/05/2021', 'Cục CS QLHC', 'Bậc 2', 'Trung cấp', '0901234567', '01/02/2026',
    '31/03/2026', '1/5', 'CV', '5.500.000', 'Thời gian', '2 tháng', '60', 'Công nhân'
  ],
  [
    '2', '90952', 'Huỳnh Phan Trúc', 'Giàu', 'Chuyền may 11-02', 'Công nhân may', '16/01/2026', '12/03/1999', 'Cần Thơ', 'Cần Thơ',
    '', 'x', 'Kinh', 'Không', '456', 'An Phú', 'Thuận An', 'Bình Dương', '', '456',
    'An Phú', 'Thuận An', 'Bình Dương', '089199005678', '20/08/2021', 'Cục CS QLHC', 'Bậc 1', 'Sơ cấp', '0912345678', '01/02/2026',
    '31/03/2026', '2/5', 'CV', '5.800.000', 'Thời gian', '2 tháng', '60', 'Công nhân'
  ]
];

export function getTimestampSuffix(d = new Date()): string {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}_${hh}${mm}${ss}`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 10000);
}

/**
 * Tạo buffer file Excel mẫu nhập lương/bậc/ngạch/chức vụ bằng ExcelJS với định dạng chuẩn
 */
export async function buildSalaryTemplateExcelBuffer(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VietSun HR';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('DSHĐĐT', {
    views: [{ showGridLines: true }],
  });

  // Thiết lập độ rộng 38 cột (A đến AL)
  const columnWidths = [
    6, 12, 18, 12, 18, 20, 14, 12, 14, 14, // 0..9 (A..J)
    7, 7, 10, 10, 14, 14, 14, 14, 14, 14, // 10..19 (K..T)
    14, 14, 14, 16, 13, 16, 12, 12, 14, 13, // 20..29 (U..AD)
    13, 10, 10, 16, 15, 12, 15, 18         // 30..37 (AE..AL)
  ];
  ws.columns = columnWidths.map((w, idx) => ({ key: `col_${idx}`, width: w }));

  // Hàng 1: Tiêu đề dòng 1 (A1:AL1)
  const row1 = ws.getRow(1);
  row1.height = 28;
  SALARY_IMPORT_HEADERS.forEach((text, idx) => {
    const cell = row1.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' }, // Xanh lá nhạt dịu mắt
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });

  // Hàng 2: Sub-headers dòng 2
  const row2 = ws.getRow(2);
  row2.height = 24;
  SALARY_IMPORT_SUBHEADERS.forEach((text, idx) => {
    const cell = row2.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 9, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });

  // Merge các nhóm cột theo chuẩn file mẫu:
  // K1:L1 (GIỚI TÍNH)
  ws.mergeCells('K1:L1');
  // O1:R1 (THƯỜNG TRÚ)
  ws.mergeCells('O1:R1');
  // T1:W1 (TẠM TRÚ)
  ws.mergeCells('T1:W1');
  // AD1:AE1 (THỬ VIỆC, ĐÀO TẠO)
  ws.mergeCells('AD1:AE1');

  // Các cột không có subheader thì merge dọc hàng 1 & 2
  const singleColIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 18, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37];
  singleColIndexes.forEach((cIdx) => {
    const colLetter = ws.getColumn(cIdx + 1).letter;
    if (colLetter) {
      ws.mergeCells(`${colLetter}1:${colLetter}2`);
    }
  });

  // Thêm các dòng dữ liệu mẫu
  SALARY_IMPORT_SAMPLE_ROWS.forEach((rowData, rIdx) => {
    const row = ws.getRow(rIdx + 3);
    row.height = 22;
    rowData.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Times New Roman', size: 10 };
      cell.alignment = {
        horizontal: cIdx === 0 || cIdx === 1 || cIdx === 10 || cIdx === 11 || cIdx === 31 || cIdx === 32 ? 'center' : 'left',
        vertical: 'middle',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
    });
  });

  return await wb.xlsx.writeBuffer();
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Tải file mẫu dạng CSV trực tiếp từ mã nguồn (kèm UTF-8 BOM chuẩn tiếng Việt cho Excel)
 */
export function downloadSalaryTemplateCsv(): void {
  const timeSuffix = getTimestampSuffix();
  const filename = `DSHĐĐTMau_${timeSuffix}.csv`;
  // \uFEFF giúp Excel tự nhận dạng UTF-8 có dấu tiếng Việt không bị lỗi font
  const blob = new Blob(['\uFEFF' + SALARY_IMPORT_SAMPLE_CSV], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerBlobDownload(blob, filename);
}

/**
 * Tải file mẫu dạng Excel (.xlsx): Tải trực tiếp từ dữ liệu mẫu mới nguyên bản được nhúng trong mã nguồn,
 * đảm bảo không bao giờ bị dính cache trình duyệt hay lỗi đường dẫn mạng.
 */
export async function downloadSalaryTemplateExcel(): Promise<void> {
  const timeSuffix = getTimestampSuffix();
  const filename = `DSHĐĐTMau_${timeSuffix}.xlsx`;

  // 1. Ưu tiên cao nhất: Lấy trực tiếp từ RAM bằng Base64 (0% network, 0% cache, tức thì)
  try {
    const blob = base64ToBlob(
      SALARY_TEMPLATE_EXCEL_BASE64,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    if (blob && blob.size > 0) {
      triggerBlobDownload(blob, filename);
      return;
    }
  } catch (err) {
    console.warn('[SalaryTemplate] Lỗi giải mã Base64, chuyển sang API download:', err);
  }

  // 2. Dự phòng 1: Gọi endpoint API tải file đính kèm query timestamp chống cache
  try {
    const res = await fetch(`/api/templates/download/salary-contract?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });
    if (res.ok) {
      const blob = await res.blob();
      triggerBlobDownload(blob, filename);
      return;
    }
  } catch (err) {
    console.warn('[SalaryTemplate] Lỗi fetch API template, chuyển sang ExcelJS:', err);
  }

  // 3. Dự phòng 2: Sinh trực tiếp từ thư viện ExcelJS trong bộ nhớ
  const buffer = await buildSalaryTemplateExcelBuffer();
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
}

/**
 * Tải file mẫu tổng quát theo định dạng yêu cầu
 */
export async function downloadSalaryTemplate(format: 'xlsx' | 'csv' = 'xlsx'): Promise<void> {
  if (format === 'csv') {
    downloadSalaryTemplateCsv();
  } else {
    await downloadSalaryTemplateExcel();
  }
}
