import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

function formatRupiah(num) {
  if (num === null || num === undefined) return '-';
  return `Rp ${Number(num).toLocaleString('id-ID')}`;
}

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return Number(num).toLocaleString('id-ID');
}

/**
 * Build column definitions + widths for a given report tab.
 */
function getColumns(tab) {
  switch (tab) {
    case 'sales':
      return [
        { label: 'Tanggal', key: 'label', width: 16 },
        { label: 'Transaksi', key: 'transactions', width: 12 },
        { label: 'Penjualan', key: 'sales', width: 18, fmt: formatRupiah },
        { label: 'Diskon', key: 'discount', width: 14, fmt: formatRupiah },
        { label: 'Pajak', key: 'tax', width: 12, fmt: formatRupiah },
        { label: 'Retur', key: 'refunds', width: 12, fmt: formatRupiah },
        { label: 'Net', key: 'net', width: 18, fmt: formatRupiah },
      ];
    case 'profit':
      return [
        { label: 'Periode', key: 'label', width: 16 },
        { label: 'Transaksi', key: 'transactions', width: 12 },
        { label: 'Revenue', key: 'revenue', width: 18, fmt: formatRupiah },
        { label: 'HPP', key: 'cogs', width: 18, fmt: formatRupiah },
        { label: 'Profit', key: 'profit', width: 18, fmt: formatRupiah },
      ];
    case 'products':
      return [
        { label: 'Produk', key: 'name', width: 32 },
        { label: 'SKU', key: 'sku', width: 16 },
        { label: 'Jumlah Terjual', key: 'quantity', width: 16, fmt: formatNumber },
        { label: 'Pendapatan', key: 'revenue', width: 20, fmt: formatRupiah },
      ];
    case 'inventory':
      return [
        { label: 'SKU', key: 'sku', width: 16 },
        { label: 'Produk', key: 'name', width: 32 },
        { label: 'Stok', key: 'stock', width: 10, fmt: formatNumber },
        { label: 'Stok Min', key: 'min_stock', width: 12, fmt: formatNumber },
        { label: 'Status', key: 'status', width: 12 },
      ];
    case 'cashier':
      return [
        { label: 'Nama Kasir', key: 'full_name', width: 24 },
        { label: 'Username', key: 'username', width: 16 },
        { label: 'Transaksi', key: 'transactions', width: 14, fmt: formatNumber },
        { label: 'Total Penjualan', key: 'total', width: 22, fmt: formatRupiah },
      ];
    case 'purchases':
      return [
        { label: 'Supplier', key: 'supplier', width: 32 },
        { label: 'Jumlah Pembelian', key: 'count', width: 18, fmt: formatNumber },
        { label: 'Total', key: 'total', width: 22, fmt: formatRupiah },
      ];
    default:
      return [];
  }
}

/**
 * Format a single cell value based on column definition.
 */
function fmtCell(col, val) {
  if (col.fmt) return col.fmt(val);
  if (val === null || val === undefined) return '-';
  return String(val);
}

// ============================================================
// EXCEL EXPORT
// ============================================================
export async function buildExcel(tab, data, meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'POS Kasir';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(capitalize(tab));
  sheet.properties.tabColor = { argb: 'FF4F46E5' };

  const cols = getColumns(tab);

  // --- title row ---
  sheet.addRow([`LAPORAN ${capitalize(tab)}`]).font = { bold: true, size: 14 };
  sheet.addRow([`Periode: ${meta.from || '-'} s/d ${meta.to || '-'}`]).font = { size: 11, color: { argb: 'FF64748B' } };
  sheet.addRow([`Dicetak: ${new Date().toLocaleString('id-ID')}`]).font = { size: 10, color: { argb: 'FF94A3B8' } };
  sheet.addRow([]);

  // --- header row ---
  const headerRow = sheet.addRow(cols.map((c) => c.label));
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  headerRow.height = 20;

  // --- data rows ---
  let rows = [];
  if (tab === 'sales') rows = data.buckets || [];
  else if (tab === 'profit') rows = data.buckets || [];
  else if (tab === 'products') rows = [...(data.top || []), ...(data.least || [])];
  else if (tab === 'inventory') rows = data.inventory_list || [];
  else if (tab === 'cashier') rows = data.cashiers || [];
  else if (tab === 'purchases') rows = data.suppliers || [];

  rows.forEach((row, i) => {
    const dataRow = sheet.addRow(cols.map((c) => {
      let val = row[c.key];
      if (tab === 'sales' && c.key === 'net') val = (row.sales || 0) - (row.refunds || 0);
      return fmtCell(c, val);
    }));
    dataRow.height = 16;
    if (i % 2 === 0) {
      dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  });

  // --- totals row ---
  if (tab === 'sales' && data.totals) {
    const t = data.totals;
    sheet.addRow([]);
    const totalsRow = sheet.addRow(['TOTAL', '', formatRupiah(t.sales), formatRupiah(t.discount), formatRupiah(t.tax), formatRupiah(t.refunds), formatRupiah((t.sales || 0) - (t.refunds || 0))]);
    totalsRow.font = { bold: true, size: 11 };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
  } else if (tab === 'profit' && data.totals) {
    const t = data.totals;
    sheet.addRow([]);
    const totalsRow = sheet.addRow(['TOTAL', '', formatRupiah(t.revenue), formatRupiah(t.cogs), formatRupiah(t.profit)]);
    totalsRow.font = { bold: true, size: 11 };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
  }

  // --- column widths ---
  sheet.columns = cols.map((c) => ({ width: c.width }));
  sheet.getRow(4).height = 20;

  // --- borders ---
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  return workbook;
}

export function excelResponse(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return workbook.xlsx.write(res).then(() => res.end());
}

// ============================================================
// PDF EXPORT
// ============================================================
export async function buildPdf(tab, data, meta = {}) {
  const printer = new PdfPrinter(fonts);
  const cols = getColumns(tab);

  let bodyRows = [];
  if (tab === 'sales') bodyRows = (data.buckets || []).map((b) => cols.map((c) => {
    let v = b[c.key];
    if (c.key === 'net') v = (b.sales || 0) - (b.refunds || 0);
    return fmtCell(c, v);
  }));
  else if (tab === 'profit') bodyRows = (data.buckets || []).map((b) => cols.map((c) => fmtCell(c, b[c.key])));
  else if (tab === 'products') bodyRows = [...(data.top || []), ...(data.least || [])].map((p) => cols.map((c) => fmtCell(c, p[c.key])));
  else if (tab === 'inventory') bodyRows = (data.inventory_list || []).map((p) => cols.map((c) => fmtCell(c, p[c.key])));
  else if (tab === 'cashier') bodyRows = (data.cashiers || []).map((c) => cols.map((col) => fmtCell(col, c[col.key])));
  else if (tab === 'purchases') bodyRows = (data.suppliers || []).map((s) => cols.map((c) => fmtCell(c, s[c.key])));

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 20],
    content: [
      { text: `LAPORAN ${capitalize(tab)}`, style: 'title' },
      { text: `Periode: ${meta.from || '-'} s/d ${meta.to || '-'}`, style: 'subtitle' },
      { text: `Dicetak: ${new Date().toLocaleString('id-ID')}`, style: 'small' },
      { text: ' ', style: 'spacer' },
      {
        table: {
          headerRows: 1,
          widths: cols.map((c) => c.width * 4),
          body: [
            cols.map((c) => ({ text: c.label, style: 'tableHeader' })),
            ...bodyRows,
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#CBD5E1',
          vLineColor: () => '#CBD5E1',
          fillColor: (rowIndex) => (rowIndex === 0 ? '#4F46E5' : rowIndex % 2 === 0 ? '#F8FAFC' : '#FFFFFF'),
          textColor: (rowIndex) => (rowIndex === 0 ? '#FFFFFF' : '#1E293B'),
          fontSize: 9,
        },
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, color: '#1E293B', margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 11, color: '#64748B', margin: [0, 0, 0, 2] },
      small: { fontSize: 9, color: '#94A3B8' },
      spacer: { fontSize: 8, margin: [0, 0, 0, 6] },
      tableHeader: { bold: true, fontSize: 9, color: '#FFFFFF', fillColor: '#4F46E5' },
    },
    defaultStyle: { fontSize: 9, color: '#1E293B' },
  };

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

export function pdfResponse(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.end(buffer);
}

function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}
