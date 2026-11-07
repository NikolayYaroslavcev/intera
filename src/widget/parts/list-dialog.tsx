import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { el } from './class-names';

interface IListDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Full subscription list for the compact sizes. Native `<dialog>`: focus trap, `Esc` and the
 * backdrop come from the browser. Content is mounted only while the dialog is open.
 */
export function ListDialog({ open, onClose, title, subtitle, children }: IListDialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      // jsdom has no showModal/close, so tests fall back to the `open` attribute.
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={el('dialog')}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Backdrop clicks target the <dialog> element itself.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {open ? (
        <div className={el('dialog-body')}>
          <header className={el('dialog-header')}>
            <div>
              <h2 id={titleId} className={el('dialog-title')}>
                {title}
              </h2>
              {subtitle ? <p className={el('muted')}>{subtitle}</p> : null}
            </div>
            <button type="button" className={el('icon-button')} onClick={onClose} aria-label="Закрыть">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
