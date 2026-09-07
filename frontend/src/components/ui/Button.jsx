import { Loader2 } from 'lucide-react';

const baseStyles = 'inline-flex items-center justify-center font-extrabold rounded-lg border-2 border-black transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed neopush active:scale-100 active:shadow-none';
const widthStyle = 'w-full';

const variantStyles = {
  primary: 'bg-primary-500 text-white shadow-[4px_4px_0_0_#0A0A0A] hover:bg-primary-600 active:bg-primary-700',
  success: 'bg-success-500 text-white shadow-[4px_4px_0_0_#0A0A0A] hover:bg-success-600 active:bg-success-700',
  danger: 'bg-danger-500 text-white shadow-[4px_4px_0_0_#0A0A0A] hover:bg-danger-600 active:bg-danger-700',
  secondary: 'bg-white text-slate-900 shadow-[4px_4px_0_0_#0A0A0A] hover:bg-slate-100 active:bg-slate-200',
  outline: 'bg-transparent text-slate-900 shadow-none hover:bg-slate-100 active:bg-slate-200',
  ghost: 'bg-transparent text-slate-900 border-transparent shadow-none hover:bg-slate-100 active:bg-slate-200',
  subtle: 'bg-slate-100 text-slate-900 shadow-[4px_4px_0_0_#0A0A0A] hover:bg-slate-200 active:bg-slate-300',
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
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? widthStyle : ''} ${className}`}
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
  const baseBtnStyles = 'inline-flex items-center justify-center font-extrabold rounded-lg border-2 border-black transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed neopush active:scale-100 active:shadow-none';

  const iconSizeMap = {
    xs: 'h-3 w-3 p-1',
    sm: 'h-3.5 w-3.5 p-1.5',
    md: 'h-4 w-4 p-2',
    lg: 'h-5 w-5 p-2.5',
    xl: 'h-6 w-6 p-3',
  };

  return (
    <button
      className={`${baseBtnStyles} ${variantStyles[variant]} ${iconSizeMap[size]} ${className}`}
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
    <div className={`inline-flex items-center rounded-lg border-2 border-black bg-white overflow-hidden shadow-[4px_4px_0_0_#0A0A0A] ${className}`} {...props}>
      {children}
    </div>
  );
}