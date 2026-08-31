import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
};

function FocusTrap({ children }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTab);
    firstElement?.focus();

    return () => container.removeEventListener('keydown', handleTab);
  }, []);

  return <div ref={containerRef}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
}) {
  const previousActiveElement = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleEscape = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <FocusTrap>
        <div
          className={`relative flex max-h-[90vh] w-full flex-col animate-scale-in rounded-2xl bg-white shadow-2xl shadow-slate-900/25 ring-1 ring-slate-200/50 ${sizeClasses[size]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              {title && (
                <h3 id="modal-title" className="text-base font-semibold text-slate-900">
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Tutup modal"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </FocusTrap>
    </div>,
    document.body
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  width = 'w-[420px] sm:max-w-[480px]',
  closeOnOverlayClick = true,
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';

    const handleEscape = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-y-0 flex ${side === 'right' ? 'right-0' : 'left-0'} ${width} max-w-full flex-col animate-slide-in bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/50`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          {title && (
            <h3 id="drawer-title" className="text-base font-semibold text-slate-900">
              {title}
            </h3>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Tutup panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Apakah Anda yakin?',
  message,
  confirmText = 'Ya, lanjutkan',
  cancelText = 'Batal',
  danger = true,
  loading = false,
  size = 'sm',
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
      title={title}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-lg p-2 ${danger ? 'bg-danger-100 text-danger-600' : 'bg-primary-100 text-primary-600'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900">{title}</p>
          {message && <p className="mt-1.5 text-sm text-slate-500">{message}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function AlertDialog({
  open,
  onClose,
  title,
  message,
  confirmText = 'OK',
  variant = 'info',
}) {
  const variantStyles = {
    info: 'bg-primary-100 text-primary-600',
    success: 'bg-success-100 text-success-600',
    warning: 'bg-warning-100 text-warning-600',
    danger: 'bg-danger-100 text-danger-600',
  };

  const variantIcons = {
    info: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    danger: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose} className="w-full sm:w-auto">
          {confirmText}
        </Button>
      }
      title={title}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-lg p-2 ${variantStyles[variant]}`}>
          {variantIcons[variant]}
        </div>
        <div className="flex-1 min-w-0">
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
      </div>
    </Modal>
  );
}