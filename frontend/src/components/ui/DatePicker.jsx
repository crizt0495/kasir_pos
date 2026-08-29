import { forwardRef } from 'react';
import { Calendar, X as XIcon } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const DatePicker = forwardRef(function DatePicker({
  label,
  error,
  hint,
  className = '',
  icon = Calendar,
  clearable = true,
  'aria-label': ariaLabel,
  id,
  ...props
}, ref) {
  const hasValue = props.value && props.value !== '';

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <icon className="h-4 w-4" />
          </span>
        )}
        <input
          ref={ref}
          type="date"
          id={id}
          className={cn(
            'w-full rounded-xl border bg-white py-2 pl-9 pr-10 text-sm',
            'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            'transition-all duration-150',
            error ? 'border-danger-300' : 'border-slate-200',
            hasValue ? 'bg-slate-50' : ''
          )}
          aria-label={ariaLabel || label}
          {...props}
        />
        {clearable && hasValue && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (props.onChange) {
                props.onChange({ target: { name: props.name, value: '' } });
              }
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Hapus tanggal"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger-600">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
});

DatePicker.displayName = 'DatePicker';

export const DateRangePicker = ({ label, from, to, onFromChange, onToChange, fromError, toError, hint, className = '' }) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row', className)}>
    <DatePicker
      id={from?.id || 'date-from'}
      label={label ? `${label} Dari` : 'Dari'}
      value={from}
      onChange={onFromChange}
      error={fromError}
      hint={hint}
      className="flex-1 sm:w-36"
    />
    <DatePicker
      id={to?.id || 'date-to'}
      label={label ? `${label} Sampai` : 'Sampai'}
      value={to}
      onChange={onToChange}
      error={toError}
      className="flex-1 sm:w-36"
    />
  </div>
);

DateRangePicker.displayName = 'DateRangePicker';