import { forwardRef, useState, useEffect } from 'react';
import { formatRupiah } from '../utils/format.js';

const baseInputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 ' +
  'transition-all duration-150 ease-out ' +
  'hover:border-slate-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:hover:border-primary-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 ' +
  'aria-invalid:border-danger-400 aria-invalid:hover:border-danger-400 aria-invalid:focus:ring-danger-500/20 aria-invalid:focus:border-danger-500';

export default forwardRef(function CurrencyInput({ error, className = '', value, onChange, ...props }, ref) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (value !== undefined && value !== null) {
      setDisplayValue(formatRupiah(value));
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '') || '';
    const num = raw ? Number(raw) : 0;
    if (onChange) {
      onChange({ target: { ...e.target, value: num } });
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      className={`${baseInputClass} ${error ? 'border-danger-400' : ''} ${className}`}
      value={displayValue}
      onChange={handleChange}
      {...props}
    />
  );
});