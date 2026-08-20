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

const CurrencyInput = forwardRef(function CurrencyInput(
  { error, className = '', onChange, onBlur, value = 0, placeholder = '0', disabled, name, id },
  ref,
) {
  const innerRef = useRef(null);
  const setRefs = useCallback((node) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const committedRef = useRef(0);

  useEffect(() => {
    if (!focused) {
      const num = Number(value || 0);
      committedRef.current = num;
      setDraft(num ? formatRupiah(num) : '');
    }
  }, [value, focused]);

  const commit = (raw) => {
    const digits = raw.replace(/\D/g, '');
    const num = digits ? Number(digits) : 0;
    committedRef.current = num;
    setDraft(num ? formatRupiah(num) : '');
    if (onChange) onChange(num);
  };

  const handleFocus = (e) => {
    setFocused(true);
    setDraft(String(committedRef.current || ''));
    requestAnimationFrame(() => {
      const input = innerRef.current;
      if (input) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    });
  };

  const handleInput = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const num = raw ? Number(raw) : 0;
    setDraft(raw || '');

    requestAnimationFrame(() => {
      const input = innerRef.current;
      if (input) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    });
  };

  const handleBlur = (e) => {
    setFocused(false);
    commit(e.target.value);
    if (onBlur) onBlur(e);
  };

  return (
    <input
      ref={setRefs}
      type="text"
      inputMode="numeric"
      name={name}
      id={id}
      disabled={disabled}
      placeholder={placeholder}
      className={`${baseInputClass} ${error ? 'border-danger-400' : ''} ${className}`}
      value={draft}
      onFocus={handleFocus}
      onInput={handleInput}
      onBlur={handleBlur}
    />
  );
});

export default CurrencyInput;
