import React, { useEffect, useId, useRef } from 'react';

// Accessible modal with:
// - Escape-key close (keyboard-only users can dismiss without the mouse)
// - Focus moved into the dialog on open + restored to the trigger on close
// - role="dialog" + aria-modal + aria-labelledby pointing at the title
// - Backdrop click to dismiss (same as before)
// - Scroll lock on <body> while open
//
// Replaces three ad-hoc `<div className="fixed inset-0 ..." onClick={close}>`
// patterns in IntakeForm, PartnerAdmin, and ClientPresentationMode.
//
// Usage:
//   <Modal open={open} onClose={() => setOpen(false)} title="Pick a customer">
//     ...modal body...
//   </Modal>

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl', backdrop = true }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Remember what was focused before — we'll restore it on close.
    previousFocusRef.current = document.activeElement;
    // Move focus into the dialog so screen readers + keyboard users land here.
    // RAF lets the DOM mount first; otherwise focus() can no-op on freshly-mounted elements.
    requestAnimationFrame(() => panelRef.current?.focus());

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);

    // Lock body scroll while open so the page underneath doesn't move when the user scrolls inside the modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever triggered the modal. Guard against the
      // element being unmounted in the meantime.
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (!backdrop) return;
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-lg p-6 w-full ${maxWidth} mt-12 outline-none focus:ring-2 focus:ring-brand-action/40`}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id={titleId} className="text-lg font-semibold text-brand-green">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-brand-green/60 hover:text-brand-green min-w-[44px] min-h-[44px] flex items-center justify-center text-2xl leading-none rounded hover:bg-brand-green/5"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
