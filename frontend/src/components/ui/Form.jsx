import { forwardRef } from 'react';

const baseInputClass =
  'w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm text-slate-900 font-medium ' +
  'placeholder:text-slate-400 ' +
  'transition-all duration-100 ease ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ' +
  'disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-300 ' +
  'aria-invalid:border-danger-500 aria-invalid:focus:ring-danger-500';

const labelClass = 'mb-1.5 block text-sm font-extrabold text-slate-900 uppercase tracking-wide';
const hintClass = 'mt-1.5 text-xs text-slate-500';
const errorClass = 'mt-1.5 text-xs text-danger-600 font-bold';
const requiredMarker = 'text-danger-500 ml-0.5';

export function Field({
  label,
  error,
  required,
  hint,
  children,
  className = '',
  labelClassName = '',
}) {
  return (
    <div className={className}>
      {label && (
        <label className={`${labelClass} ${labelClassName}`}>
          {label}
          {required && <span className={requiredMarker} aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <p className={errorClass} role="alert">{error}</p> : hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ error, className = '', 'aria-describedby': ariaDescribedBy, ...props }, ref) {
  const describedBy = error ? `${props.id}-error` : ariaDescribedBy;
  return (
    <input
      ref={ref}
      className={`${baseInputClass} ${error ? 'border-danger-500' : ''} ${className}`}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ error, children, className = '', 'aria-describedby': ariaDescribedBy, ...props }, ref) {
  const describedBy = error ? `${props.id}-error` : ariaDescribedBy;
  return (
    <select
      ref={ref}
      className={`${baseInputClass} ${error ? 'border-danger-500' : ''} ${className} appearance-none bg-no-repeat bg-right`}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%230A0A0A' stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.75rem center',
        backgroundSize: '1rem',
        paddingRight: '2.5rem',
      }}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      {...props}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ error, className = '', 'aria-describedby': ariaDescribedBy, ...props }, ref) {
  const describedBy = error ? `${props.id}-error` : ariaDescribedBy;
  return (
    <textarea
      ref={ref}
      className={`${baseInputClass} ${error ? 'border-danger-500' : ''} ${className} resize-y min-h-[80px]`}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      {...props}
    />
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, className = '', id, ...props }, ref) {
  const checkboxId = id || `checkbox-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label className={`inline-flex items-start gap-2.5 cursor-pointer ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        id={checkboxId}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-black bg-white text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed accent-primary-600"
        {...props}
      />
      {label && <span className="text-sm font-medium text-slate-800 leading-relaxed">{label}</span>}
    </label>
  );
});

export const RadioGroup = forwardRef(function RadioGroup({ label, options, error, required, hint, className = '', name, ...props }, ref) {
  return (
    <Field label={label} error={error} required={required} hint={hint} className={className}>
      <fieldset className="space-y-2" role="radiogroup" aria-label={label} {...props}>
        {options.map((option) => (
          <label key={option.value} className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              className="h-4 w-4 border-2 border-black bg-white text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors disabled:opacity-50 accent-primary-600"
            />
            <span className="text-sm font-medium text-slate-800">{option.label}</span>
          </label>
        ))}
      </fieldset>
      {error && <p id={`${name}-error`} className={errorClass} role="alert">{error}</p>}
    </Field>
  );
});

export const Switch = forwardRef(function Switch({ label, id, className = '', ...props }, ref) {
  const switchId = id || `switch-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label className={`inline-flex items-center gap-3 cursor-pointer ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        id={switchId}
        role="switch"
        className="h-6 w-11 rounded-lg border-2 border-black bg-white appearance-none cursor-pointer transition-all duration-100 ease
          checked:bg-primary-500 checked:border-primary-500 checked:translate-x-5
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed"
        {...props}
      />
      {label && <span className="text-sm font-bold text-slate-800">{label}</span>}
    </label>
  );
});

export function InputGroup({ children, className = '', error, 'aria-describedby': ariaDescribedBy }) {
  return (
    <div className={`flex rounded-lg border-2 border-black bg-white overflow-hidden transition-all duration-100 ${error ? 'border-danger-500' : ''} ${className}`}>
      <div className="flex items-stretch" role="group" aria-labelledby={ariaDescribedBy}>
        {children}
      </div>
    </div>
  );
}

export function InputAddon({ children, className = '', position = 'start' }) {
  return (
    <div className={`flex items-center px-3 text-sm font-bold text-slate-700 bg-slate-100 border-${position === 'start' ? 'r' : 'l'}-2 border-black ${className}`}>
      {children}
    </div>
  );
}