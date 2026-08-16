import { Loader2 } from 'lucide-react';

const variantStyles = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:ring-primary-500',
  success: 'bg-success-600 text-white hover:bg-success-700 active:bg-success-800 focus-visible:ring-success-500',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 focus-visible:ring-danger-500',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-slate-400',
  outline: 'border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200 focus-visible:ring-primary-400',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-slate-400',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 focus-visible:ring-slate-400',
};

const sizeStyles = {
  xs: 'px-2 py-1 text-[0.7rem] gap-1',
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-1.5',
  lg: 'px-4.5 py-2.5 text-base gap-2',
  xl: 'px-6 py-3 text-lg gap-2',
};

const iconSizes = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  children,
  className = '',
  disabled,
  fullWidth = false,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-120 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} aria-hidden="true" />
      ) : Icon ? (
        <Icon className={`${iconSizes[size]} shrink-0`} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  variant = 'ghost',
  size = 'md',
  loading = false,
  icon: Icon,
  children,
  className = '',
  disabled,
  'aria-label': ariaLabel,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-120 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.95]';

  const iconSizeMap = {
    xs: 'h-3 w-3 p-1',
    sm: 'h-3.5 w-3.5 p-1.5',
    md: 'h-4 w-4 p-2',
    lg: 'h-5 w-5 p-2.5',
    xl: 'h-6 w-6 p-3',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${iconSizeMap[size]} ${className}`}
      disabled={disabled || loading}
      aria-label={ariaLabel || children}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : children}
    </button>
  );
}

export function ButtonGroup({ children, className = '', ...props }) {
  return (
    <div className={`inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden ${className}`} {...props}>
      {children}
    </div>
  );
}