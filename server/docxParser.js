import JSZip from 'jszip';
import mammoth from 'mammoth';
import { cleanVietnameseDiacritics } from './routes.js';

/**
 * Advanced DOCX to HTML Converter
 * Preserves text alignment (center, right, justify), font sizes, bold, italic,
 * underline, tables with cell widths and alignments, tabs, and embedded images.
 */
export async function convertDocxToFormattedHtml(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('Không tìm thấy word/document.xml trong file docx');
    }

    const docXml = await docXmlFile.async('string');

    // Load relationships for images
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const imageMap = {};
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      const relMatches = relsXml.match(/<Relationship[^>]+>/g) || [];
      for (const rel of relMatches) {
        const idMatch = rel.match(/Id="([^"]+)"/);
        const typeMatch = rel.match(/Type="([^"]+)"/);
        const targetMatch = rel.match(/Target="([^"]+)"/);
        if (idMatch && typeMatch && targetMatch && typeMatch[1].includes('/image')) {
          const rId = idMatch[1];
          let target = targetMatch[1];
          if (target.startsWith('/')) target = target.slice(1);
          if (!target.startsWith('word/')) target = 'word/' + target;

          const imgFile = zip.file(target);
          if (imgFile) {
            const imgData = await imgFile.async('base64');
            const ext = target.split('.').pop().toLowerCase();
            const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
            imageMap[rId] = `data:${mimeType};base64,${imgData}`;
          }
        }
      }
    }

    // Extract body
    const bodyMatch = docXml.match(/<w:body[\s>]([\s\S]*?)<\/w:body>/);
    if (!bodyMatch) {
      throw new Error('Thẻ w:body không tồn tại trong tài liệu');
    }
    const bodyContent = bodyMatch[1];

    // Tokenize top-level w:p and w:tbl in exact sequential order
    const tokenRegex = /<(w:p|w:tbl)[\s>][\s\S]*?<\/\1>/g;
    const elements = bodyContent.match(tokenRegex) || [];

    const htmlParts = [];
    const rawTextParts = [];

    for (const el of elements) {
      if (el.startsWith('<w:p')) {
        const { html, text } = parseParagraph(el, imageMap);
        if (html !== null) htmlParts.push(html);
        if (text) rawTextParts.push(text);
      } else if (el.startsWith('<w:tbl')) {
        const { html, text } = parseTable(el, imageMap);
        if (html !== null) htmlParts.push(html);
        if (text) rawTextParts.push(text);
      }
    }

    let finalHtml = htmlParts.join('\n');

    // Lọc sạch triệt để mọi thẻ Word XML thừa nếu có
    finalHtml = finalHtml
      .replace(/&lt;\/?w:[^&]+&gt;/gi, '')
      .replace(/<\/?w:[^>]+>/gi, '');

    finalHtml = cleanVietnameseDiacritics(finalHtml);
    const finalRawText = cleanVietnameseDiacritics(rawTextParts.join('\n'));

    return {
      contentHtml: finalHtml,
      rawText: finalRawText,
      messages: [],
    };
  } catch (err) {
    console.warn('[DocxParser] Chuyển đổi nâng cao gặp lỗi, chuyển sang mammoth dự phòng:', err.message);
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);
    return {
      contentHtml: cleanVietnameseDiacritics(htmlResult.value),
      rawText: cleanVietnameseDiacritics(textResult.value),
      messages: htmlResult.messages,
    };
  }
}

function parseParagraph(pXml, imageMap = {}) {
  // Extract pPr
  const pPrMatch = pXml.match(/<w:pPr[\s>]([\s\S]*?)<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[1] : '';

  // Alignment (center, right, both/justify, left)
  const jcMatch = pPr.match(/<w:jc[^>]*w:val="([^"]+)"/);
  const jc = jcMatch ? jcMatch[1].toLowerCase() : 'left';
  let textAlign = 'left';
  if (jc === 'center') textAlign = 'center';
  else if (jc === 'right') textAlign = 'right';
  else if (jc === 'both' || jc === 'distribute') textAlign = 'justify';

  // Indent
  const indMatch = pPr.match(/<w:ind[^>]*w:firstLine="([^"]+)"/);
  const firstLineIndent = indMatch ? Math.round(parseInt(indMatch[1], 10) / 20) : 0; // dxa to pt

  // Spacing
  const spBeforeMatch = pPr.match(/<w:spacing[^>]*w:before="([^"]+)"/);
  const spAfterMatch = pPr.match(/<w:spacing[^>]*w:after="([^"]+)"/);
  const beforePt = spBeforeMatch ? Math.round(parseInt(spBeforeMatch[1], 10) / 20) : 0;
  const afterPt = spAfterMatch ? Math.round(parseInt(spAfterMatch[1], 10) / 20) : 3;

  // Extract runs, tabs, drawings, breaks
  const tokenRegex = /<(w:r|w:hyperlink)[\s>][\s\S]*?<\/\1>|<w:drawing[\s>][\s\S]*?<\/w:drawing>|<w:tab\s*\/?>|<w:br\s*\/?>|<w:cr\s*\/?>/g;
  const items = pXml.match(tokenRegex) || [];

  let innerHtml = '';
  let plainText = '';

  for (const item of items) {
    if (item.startsWith('<w:tab')) {
      innerHtml += '<span style="display: inline-block; min-width: 2.5em;">&nbsp;&nbsp;&nbsp;&nbsp;</span>';
      plainText += '\t';
    } else if (item.startsWith('<w:br') || item.startsWith('<w:cr')) {
      innerHtml += '<br/>';
      plainText += '\n';
    } else if (item.startsWith('<w:drawing')) {
      const imgMatch = item.match(/r:embed="([^"]+)"/);
      if (imgMatch && imageMap[imgMatch[1]]) {
        innerHtml += `<img src="${imageMap[imgMatch[1]]}" style="max-width: 100%; height: auto; display: inline-block;" alt="Hình ảnh" />`;
      }
    } else if (item.startsWith('<w:r') || item.startsWith('<w:hyperlink')) {
      const { html, text } = parseRun(item);
      innerHtml += html;
      plainText += text;
    }
  }

  // Paragraph trống
  if (!innerHtml.trim()) {
    return {
      html: `<div style="height: 10pt; text-align: ${textAlign};"></div>`,
      text: '',
    };
  }

  const styles = [
    `text-align: ${textAlign}`,
    `margin-top: ${beforePt}pt`,
    `margin-bottom: ${afterPt}pt`,
    `line-height: 1.5`,
  ];
  if (firstLineIndent > 0) {
    styles.push(`text-indent: ${firstLineIndent}pt`);
  }

  return {
    html: `<div style="${styles.join('; ')}; font-size: 13pt;">${innerHtml}</div>`,
    text: plainText,
  };
}

function parseRun(rXml) {
  const rPrMatch = rXml.match(/<w:rPr[\s>]([\s\S]*?)<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[1] : '';

  const isBold = /<w:b(\s|\/|>)/.test(rPr) && !/<w:b[^>]*w:val="(false|0|none)"/.test(rPr);
  const isItalic = /<w:i(\s|\/|>)/.test(rPr) && !/<w:i[^>]*w:val="(false|0|none)"/.test(rPr);
  const isUnderline = /<w:u[^>]*w:val="(?!none|false)[^"]+"/.test(rPr) || /<w:u\/>/.test(rPr);

  // Font size (w:sz val is half-points, e.g. 28 = 14pt)
  const szMatch = rPr.match(/<w:sz[^>]*w:val="([^"]+)"/);
  const fontSizePt = szMatch ? Math.round(parseInt(szMatch[1], 10) / 2) : null;

  let runText = '';
  let plainText = '';

  // Parse strictly: <w:t ...>...</w:t> (requiring space or > after w:t) vs <w:tab/> vs <w:br/>
  const tokenRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/?>|<w:br\s*\/?>|<w:cr\s*\/?>|<w:noBreakHyphen\s*\/?>/g;
  let m;
  while ((m = tokenRegex.exec(rXml)) !== null) {
    const full = m[0];
    if (full.startsWith('<w:tab')) {
      runText += '<span style="display: inline-block; min-width: 2.5em;">&nbsp;&nbsp;&nbsp;&nbsp;</span>';
      plainText += '\t';
    } else if (full.startsWith('<w:br') || full.startsWith('<w:cr')) {
      runText += '<br/>';
      plainText += '\n';
    } else if (full.startsWith('<w:noBreakHyphen')) {
      runText += '&#8209;';
      plainText += '-';
    } else {
      // Content of <w:t>
      const raw = (m[1] || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      plainText += raw;
      const escaped = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      runText += escaped;
    }
  }

  if (!runText) return { html: '', text: '' };

  let wrapped = runText;
  if (isBold) wrapped = `<strong>${wrapped}</strong>`;
  if (isItalic) wrapped = `<em>${wrapped}</em>`;
  if (isUnderline) wrapped = `<u>${wrapped}</u>`;
  if (fontSizePt && fontSizePt !== 13) {
    wrapped = `<span style="font-size: ${fontSizePt}pt;">${wrapped}</span>`;
  }

  return { html: wrapped, text: plainText };
}

function parseTable(tblXml, imageMap = {}) {
  // Check borders
  const tblPrMatch = tblXml.match(/<w:tblPr[\s>]([\s\S]*?)<\/w:tblPr>/);
  const tblPr = tblPrMatch ? tblPrMatch[1] : '';

  // Has border if tblBorders exists and is not 'none' or 'nil'
  let hasBorders = false;
  if (/<w:tblBorders[\s>]([\s\S]*?)<\/w:tblBorders>/.test(tblPr)) {
    const bordersContent = tblPr.match(/<w:tblBorders[\s>]([\s\S]*?)<\/w:tblBorders>/)[1];
    hasBorders = !/<w:(top|left|bottom|right|insideH|insideV)[^>]*w:val="(none|nil)"/i.test(bordersContent);
  }

  const rows = tblXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  if (rows.length === 0) return { html: '', text: '' };

  const rowsHtml = [];
  const tableTextParts = [];

  for (const rXml of rows) {
    const cells = rXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
    const cellsHtml = [];
    const rowTextParts = [];

    // Calculate row width
    let totalRowDxa = 0;
    const cellWidths = cells.map((c) => {
      const wMatch = c.match(/<w:tcW[^>]*w:w="([^"]+)"/);
      const w = wMatch ? parseInt(wMatch[1], 10) : 0;
      totalRowDxa += w;
      return w;
    });

    for (let cIdx = 0; cIdx < cells.length; cIdx++) {
      const cXml = cells[cIdx];
      const wDxa = cellWidths[cIdx];
      const pct = totalRowDxa > 0 && wDxa > 0 ? Math.round((wDxa / totalRowDxa) * 100) : null;

      // Extract paragraphs inside cell
      const pElements = cXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
      const cellHtmlParts = [];
      const cellTextParts = [];

      for (const p of pElements) {
        const { html, text } = parseParagraph(p, imageMap);
        if (html !== null) cellHtmlParts.push(html);
        if (text) cellTextParts.push(text);
      }

      const cellStyles = [
        'vertical-align: top',
        'padding: 4px 8px',
      ];
      if (pct) cellStyles.push(`width: ${pct}%`);
      if (hasBorders) cellStyles.push('border: 1px solid #000000');
      else cellStyles.push('border: none');

      cellsHtml.push(`    <td style="${cellStyles.join('; ')}">\n${cellHtmlParts.join('\n')}\n    </td>`);
      rowTextParts.push(cellTextParts.join(' '));
    }

    rowsHtml.push(`  <tr>\n${cellsHtml.join('\n')}\n  </tr>`);
    tableTextParts.push(rowTextParts.join('\t'));
  }

  const tableStyles = [
    'width: 100%',
    'border-collapse: collapse',
    'margin-top: 8px',
    'margin-bottom: 8px',
  ];

  return {
    html: `<table style="${tableStyles.join('; ')}">\n${rowsHtml.join('\n')}\n</table>`,
    text: tableTextParts.join('\n'),
  };
}
