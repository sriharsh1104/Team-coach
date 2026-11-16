import { useEffect, useRef } from 'react';
import { isDesktopApp } from '../lib/platform';

type CredentialResponse = { credential?: string };

type GoogleAccounts = {
  id: {
    initialize: (config: {
      client_id: string;
      callback: (response: CredentialResponse) => void;
    }) => void;
    renderButton: (
      parent: HTMLElement,
      options: {
        type?: string;
        theme?: string;
        size?: string;
        text?: string;
        shape?: string;
        width?: number;
        logo_alignment?: string;
      },
    ) => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-google-identity]',
  );
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Could not load Google sign-in')),
        { once: true },
      );
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(script);
  });
}

type Props = {
  disabled?: boolean;
  onCredential: (idToken: string) => void;
  onError: (message: string) => void;
};

export function GoogleSignInButton({ disabled, onCredential, onError }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!CLIENT_ID || !slotRef.current || isDesktopApp()) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !slotRef.current || !window.google?.accounts?.id) return;
        slotRef.current.innerHTML = '';
        const width = Math.max(240, Math.floor(slotRef.current.clientWidth));
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (!response.credential) {
              onErrorRef.current('Google sign-in failed');
              return;
            }
            onCredentialRef.current(response.credential);
          },
        });
        window.google.accounts.id.renderButton(slotRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width,
          logo_alignment: 'left',
        });
      })
      .catch(() => onErrorRef.current('Could not load Google sign-in'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Google Identity Services only accepts http(s) origins that are listed as
  // "Authorized JavaScript origins" on the OAuth client. The Tauri desktop app
  // runs on tauri://localhost (Linux) / http://tauri.localhost (Windows), which
  // Google rejects — so the GSI button would render and then fail on click.
  // Show a plain button with a clear message instead.
  if (isDesktopApp()) {
    return (
      <button
        type="button"
        className="team-google-fallback"
        disabled={disabled}
        onClick={() =>
          onError(
            'Google sign-in is not available in the desktop app yet. Use email + password, or sign in on sacredesports.com.',
          )
        }
      >
        Continue with Google
      </button>
    );
  }

  if (!CLIENT_ID) {
    return (
      <button
        type="button"
        className="team-google-fallback"
        disabled={disabled}
        onClick={() =>
          onError(
            'Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID.',
          )
        }
      >
        Continue with Google
      </button>
    );
  }

  return <div ref={slotRef} className="team-google-slot" />;
}
