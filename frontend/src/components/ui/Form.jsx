import { forwardRef } from 'react';

const baseClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

export function Field({ label, error, required, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* forwardRef wajib agar ref dari react-hook-form register() sampai ke <input> */
export const Input = forwardRef(function Input({ error, className = '', ...props }, ref) {
  return <input ref={ref} className={`${baseClass} ${error ? 'border-red-400' : ''} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ error, children, className = '', ...props }, ref) {
  return (
    <select ref={ref} className={`${baseClass} ${error ? 'border-red-400' : ''} ${className}`} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ error, className = '', ...props }, ref) {
  return <textarea ref={ref} className={`${baseClass} ${error ? 'border-red-400' : ''} ${className}`} {...props} />;
});

export const Checkbox = forwardRef(function Checkbox({ label, className = '', ...props }, ref) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-slate-700 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        {...props}
      />
      {label}
    </label>
  );
});
