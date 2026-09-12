import { buildReceiptLayout } from '../../utils/escpos.js';

/**
 * Struk thermal 58mm / 80mm.
 * Preview ini di-render dari buildReceiptLayout() — fungsi yang SAMA
 * dengan encoder ESC/POS, sehingga tampilan modal = hasil cetak persis.
 */
export default function Receipt({ sale, store, pos }) {
  const { width, lines } = buildReceiptLayout({ sale, store, pos });
  const is80 = pos?.receipt_width === '80mm';

  return (
    <div
      className="receipt-print mx-auto bg-white p-3 font-mono text-black"
      style={{ width: `${width}ch`, maxWidth: is80 ? '75mm' : '60mm' }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.align === 'center'
              ? 'whitespace-pre text-center'
              : 'whitespace-pre'
          }
        >
          <span
            className={
              line.style === 'bold-double'
                ? 'text-sm font-bold'
                : line.style === 'bold'
                  ? 'text-xs font-bold'
                  : 'text-xs'
            }
          >
            {line.text}
          </span>
        </div>
      ))}
    </div>
  );
}