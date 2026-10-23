import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  panelClassName?: string;
  dismissible?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  labelledBy,
  children,
  panelClassName = '',
  dismissible = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable || panelRef.current)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, dismissible]);

  if (!isOpen) return null;

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className={`${panelClassName} focus:outline-hidden`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
