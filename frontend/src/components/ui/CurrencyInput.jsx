import { forwardRef, useRef, useCallback, useEffect, useState } from 'react';
import { formatRupiah } from '../utils/format.js';

const baseInputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 ' +
  'transition-all duration-150 ease-out ' +
  'hover:border-slate-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:hover:border-primary-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 ' +
  'aria-invalid:border-danger-400 aria-invalid:hover:border-danger-400 aria-invalid:focus:ring-danger-500/20 aria-invalid:focus:border-danger-500';

export default forwardRef(function CurrencyInput({ error, className = '', onChange, value, ...props }, ref) {
  const innerRef = useRef(null);
  const refCallback = useCallback((node) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    const num = Number(value || 0);
    setDisplayValue(num ? formatRupiah(num) : '');
  }, [value]);

  const handleChange = (e) => {
    const cursorPos = e.target.selectionStart;
    const oldDisplay = e.target.value;

    const digits = oldDisplay.replace(/\D/g, '');
    const num = digits ? Number(digits) : 0;

    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: { ...e.target, value: num },
      };
      onChange(syntheticEvent);
    }

    requestAnimationFrame(() => {
      const input = innerRef.current;
      if (!input) return;
      const newDisplay = input.value;
      if (num === 0) {
        input.setSelectionRange(0, 0);
        return;
      }
      const oldDigits = oldDisplay.replace(/\D/g, '');
      const newDigits = newDisplay.replace(/\D/g, '');
      let newPos = cursorPos;
      if (newDigits.length > oldDigits.length) {
        newPos = cursorPos + (newDigits.length - oldDigits.length);
      } else if (newDigits.length < oldDigits.length) {
        newPos = cursorPos - (oldDigits.length - newDigits.length);
      }
      newPos = Math.max(0, Math.min(newPos, newDisplay.length));
      input.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <input
      ref={refCallback}
      type="text"
      inputMode="numeric"
      className={`${baseInputClass} ${error ? 'border-danger-400' : ''} ${className}`}
      value={displayValue}
      onChange={handleChange}
      {...props}
    />
  );
});
