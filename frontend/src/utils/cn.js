/**
 * Tailwind CSS class name combiner.
 * Simple implementation without external deps.
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}