import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AccountMenu() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-btn"
        aria-label="Account settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⚙
      </button>
      <div
        className={`account-menu-panel${open ? ' open' : ''}`}
        role="menu"
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <button
          type="button"
          role="menuitem"
          className="account-menu-item"
          onClick={() => {
            setOpen(false);
            navigate('/settings');
          }}
        >
          Security
        </button>
        <div className="account-menu-divider" />
        <button
          type="button"
          role="menuitem"
          className="account-menu-item danger"
          onClick={() => {
            setOpen(false);
            navigate('/');
            void logout();
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
