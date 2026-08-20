import { forwardRef, useRef, useCallback, useEffect, useState } from 'react';
import { formatRupiah } from '../../utils/format.js';

const baseInputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 ' +
  'transition-all duration-150 ease-out ' +
  'hover:border-slate-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:hover:border-primary-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 ' +
  'aria-invalid:border-danger-400 aria-invalid:hover:border-danger-400 aria-invalid:focus:ring-danger-500/20 aria-invalid:focus:border-danger-500';

export default forwardRef(function CurrencyInput({ error, className = '', onChange, value = 0, placeholder = '0', ...props }, ref) {
  const innerRef = useRef(null);
  const refCallback = useCallback((node) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const [displayValue, setDisplayValue] = useState('');
  const composingRef = useRef(false);

  useEffect(() => {
    const num = Number(value || 0);
    setDisplayValue(num ? formatRupiah(num) : '');
  }, [value]);

  const handleInput = (e) => {
    if (composingRef.current) return;
    applyFormat(e);
  };

  const handleCompositionEnd = (e) => {
    composingRef.current = false;
    applyFormat(e);
  };

  const applyFormat = (e) => {
    const input = innerRef.current;
    if (!input) return;
    const cursorPos = input.selectionStart;
    const raw = input.value;
    const digits = raw.replace(/\D/g, '');
    const num = digits ? Number(digits) : 0;

    const newDisplay = num ? formatRupiah(num) : '';
    setDisplayValue(newDisplay);

    if (onChange) {
      onChange(num);
    }

    requestAnimationFrame(() => {
      if (!innerRef.current) return;
      if (num === 0) {
        innerRef.current.setSelectionRange(0, 0);
        return;
      }
      const oldDigitCount = (raw.match(/\d/g) || []).length;
      const newDigitCount = (newDisplay.match(/\d/g) || []).length;
      let newPos = cursorPos + (newDigitCount - oldDigitCount);
      newPos = Math.max(0, Math.min(newPos, newDisplay.length));
      innerRef.current.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <input
      ref={refCallback}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      className={`${baseInputClass} ${error ? 'border-danger-400' : ''} ${className}`}
      value={displayValue}
      onInput={handleInput}
      onCompositionEnd={handleCompositionEnd}
      {...props}
    />
  );
});
