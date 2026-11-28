import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  Calendar,
  Building2,
  User,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { AppSettings, AppointmentDecision } from '../types';
import { api } from '../api';

interface AppointmentDetailModalProps {
  decision: AppointmentDecision | null;
  appSettings?: AppSettings | null;
  onClose: () => void;
}

function formatVnDate(iso?: string) {
  if (!iso) return '—';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getStatusBadge(status: AppointmentDecision['status']) {
  switch (status) {
    case 'pending_effective':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" /> Chờ hiệu lực
        </span>
      );
    case 'effective':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" /> Đang hiệu lực
        </span>
      );
    case 'dismissed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
          <AlertTriangle className="w-3.5 h-3.5" /> Đã miễn nhiệm
        </span>
      );
    case 'replaced':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
          Đã chuyển chức vụ
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
          Hết nhiệm kỳ
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
          {status}
        </span>
      );
  }
}

export const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  decision,
  appSettings,
  onClose,
}) => {
  const [exporting, setExporting] = useState(false);

  if (!decision) return null;

  const isAppointment = decision.decisionType === 'bo_nhiem';
  const companyName = appSettings?.companyName || 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT';
  const companyBranch = appSettings?.companyBranch || 'VIETSUN ĐỒNG NAI';

  const handlePrintDecision = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;

    const signParts = (decision.signDate || '').split('-');
    const day = signParts[2] || '...';
    const month = signParts[1] || '...';
    const year = signParts[0] || '....';

    const titleText = isAppointment
      ? `V/v: Bổ nhiệm cán bộ`
      : `V/v: Miễn nhiệm chức vụ cán bộ`;

    const article1 = isAppointment
      ? `Bổ nhiệm Ông/Bà: <strong>${decision.fullName}</strong> (MSNV: <strong>${decision.msnv}</strong>) giữ chức vụ: <strong>${decision.positionTitle}</strong> tại đơn vị: <strong>${decision.departmentName}</strong>.`
      : `Miễn nhiệm chức vụ: <strong>${decision.positionTitle}</strong> tại đơn vị: <strong>${decision.departmentName}</strong> đối với Ông/Bà: <strong>${decision.fullName}</strong> (MSNV: <strong>${decision.msnv}</strong>).${decision.reason ? `<br/>Lý do miễn nhiệm: ${decision.reason}.` : ''}`;

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Quyết định ${decision.decisionNumber}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 14pt; line-height: 1.5; color: #000; margin: 20mm 20mm 20mm 25mm; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .header-table td { vertical-align: top; text-align: center; }
    .bold { font-weight: bold; }
    .upper { text-transform: uppercase; }
    .title { text-align: center; font-weight: bold; font-size: 16pt; margin-top: 20px; }
    .sub-title { text-align: center; font-style: italic; margin-bottom: 20px; }
    .article { margin-bottom: 12px; text-align: justify; }
    .sign-block { width: 45%; float: right; text-align: center; margin-top: 30px; }
    @media print { body { margin: 15mm; } }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td style="width: 45%;">
        <div class="bold upper" style="font-size: 12pt;">${companyName}</div>
        <div class="bold upper" style="font-size: 12pt;">${companyBranch}</div>
        <div>──────────</div>
        <div style="margin-top: 6px;">Số: <strong>${decision.decisionNumber}</strong></div>
      </td>
      <td style="width: 55%;">
        <div class="bold upper" style="font-size: 12pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="bold" style="font-size: 13pt;">Độc lập - Tự do - Hạnh phúc</div>
        <div>────────────────</div>
        <div style="font-style: italic; margin-top: 6px;">Đồng Nai, ngày ${day} tháng ${month} năm ${year}</div>
      </td>
    </tr>
  </table>

  <div class="title upper">QUYẾT ĐỊNH</div>
  <div class="sub-title">${titleText}</div>

  <div class="article">
    - Căn cứ vào Điều lệ tổ chức và hoạt động của ${companyName};<br/>
    - Căn cứ vào nhu cầu công tác và năng lực cán bộ của đơn vị;
  </div>

  <div style="text-align: center; font-weight: bold; margin: 14px 0;">QUYẾT ĐỊNH:</div>

  <div class="article">
    <strong>Điều 1.</strong> ${article1}
  </div>
  <div class="article">
    <strong>Điều 2.</strong> Quyết định này có hiệu lực kể từ ngày <strong>${formatVnDate(decision.effectiveDate)}</strong>${decision.endDate ? ` đến ngày <strong>${formatVnDate(decision.endDate)}</strong>` : ''}.
  </div>
  <div class="article">
    <strong>Điều 3.</strong> Phòng Hành chính - Nhân sự, các bộ phận liên quan và Ông/Bà <strong>${decision.fullName}</strong> chịu trách nhiệm thi hành Quyết định này.
  </div>

  <div class="sign-block">
    <div class="bold upper">${decision.signerName || 'NGƯỜI KÝ QUYẾT ĐỊNH'}</div>
    <div style="font-style: italic; font-size: 11pt;">(Ký, ghi rõ họ tên và đóng dấu)</div>
    <div style="height: 70px;"></div>
    <div class="bold">${decision.signerName || ''}</div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handleExportDocx = async () => {
    try {
      setExporting(true);
      const signParts = (decision.signDate || '').split('-');
      const day = signParts[2] || '...';
      const month = signParts[1] || '...';
      const year = signParts[0] || '....';

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: companyName, bold: true, size: 24 }),
                  new TextRun({ text: ` - ${companyBranch}`, bold: true, size: 24 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text: `Số: ${decision.decisionNumber} | Ngày ký: ${day}/${month}/${year}`,
                    italics: true,
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
                children: [
                  new TextRun({
                    text: isAppointment ? 'QUYẾT ĐỊNH BỔ NHIỆM' : 'QUYẾT ĐỊNH MIỄN NHIỆM',
                    bold: true,
                    size: 32,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { before: 200, after: 120 },
                children: [
                  new TextRun({ text: 'Điều 1. ', bold: true, size: 24 }),
                  new TextRun({
                    text: isAppointment
                      ? `Bổ nhiệm Ông/Bà ${decision.fullName} (MSNV: ${decision.msnv}) giữ chức vụ ${decision.positionTitle} tại đơn vị ${decision.departmentName}.`
                      : `Miễn nhiệm chức vụ ${decision.positionTitle} tại đơn vị ${decision.departmentName} đối với Ông/Bà ${decision.fullName} (MSNV: ${decision.msnv}).`,
                    size: 24,
                  }),
                ],
              }),
              ...(!isAppointment && decision.reason
                ? [
                    new Paragraph({
                      spacing: { after: 120 },
                      children: [
                        new TextRun({ text: 'Lý do miễn nhiệm: ', bold: true, size: 24 }),
                        new TextRun({ text: decision.reason, size: 24 }),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: 'Điều 2. ', bold: true, size: 24 }),
                  new TextRun({
                    text: `Quyết định có hiệu lực từ ngày ${formatVnDate(decision.effectiveDate)}${decision.endDate ? ` đến ngày ${formatVnDate(decision.endDate)}` : ''}.`,
                    size: 24,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 240 },
                children: [
                  new TextRun({ text: 'Điều 3. ', bold: true, size: 24 }),
                  new TextRun({
                    text: `Phòng Hành chính - Nhân sự, các bộ phận liên quan và Ông/Bà ${decision.fullName} chịu trách nhiệm thi hành Quyết định này.`,
                    size: 24,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Người ký: ${decision.signerName || 'Ban Giám đốc'}`,
                    bold: true,
                    size: 24,
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QuyetDinh_${decision.decisionNumber.replace(/[^\w.-]/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isAppointment ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Chi tiết quyết định {isAppointment ? 'bổ nhiệm' : 'miễn nhiệm'}
              </h3>
              <p className="text-xs text-slate-500">Số quyết định: {decision.decisionNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-900 text-base">{decision.fullName}</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold">
                MSNV: {decision.msnv}
              </span>
            </div>
            {getStatusBadge(decision.status)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 mb-1">
                {isAppointment ? 'Chức vụ được bổ nhiệm' : 'Chức vụ bị miễn nhiệm'}
              </div>
              <div className="font-bold text-slate-900 text-sm">{decision.positionTitle}</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Đơn vị / Phòng ban
              </div>
              <div className="font-bold text-slate-900 text-sm">{decision.departmentName}</div>
              {decision.divisionName && (
                <div className="text-[11px] text-slate-500 mt-0.5">Khối: {decision.divisionName}</div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Ngày ký / Ngày hiệu lực
              </div>
              <div className="font-semibold text-slate-800">
                Ký: {formatVnDate(decision.signDate)} • Hiệu lực:{' '}
                <span className="text-blue-700 font-bold">{formatVnDate(decision.effectiveDate)}</span>
              </div>
              {decision.endDate && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Kết thúc nhiệm kỳ: {formatVnDate(decision.endDate)}
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500 mb-1">Người ký quyết định</div>
              <div className="font-bold text-slate-900">{decision.signerName || 'Chưa cập nhật'}</div>
            </div>
          </div>

          {!isAppointment && decision.reason && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs">
              <div className="font-bold text-rose-800 mb-1">Lý do miễn nhiệm</div>
              <div className="text-rose-900">{decision.reason}</div>
            </div>
          )}

          {decision.notes && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-bold text-slate-700 mb-1">Ghi chú</div>
              <div className="text-slate-700 whitespace-pre-line">{decision.notes}</div>
            </div>
          )}

          {/* File đính kèm */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-700">File đính kèm:</span>
              <span className="text-slate-800">{decision.attachmentName || 'Không có file đính kèm'}</span>
            </div>
            {decision.attachmentPath && (
              <div className="flex items-center gap-2">
                <a
                  href={api.getAppointmentAttachmentUrl(decision.id, false)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Xem file
                </a>
                <a
                  href={api.getAppointmentAttachmentUrl(decision.id, true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Tải xuống
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintDecision}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>In quyết định</span>
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportDocx}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Đang xuất...' : 'Xuất Word (.docx)'}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
