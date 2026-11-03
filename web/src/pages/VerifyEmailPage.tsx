import { FormEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { emailCompact } from '../auth/emailCompact';
import { useAuth } from '../auth/AuthContext';
import { postAuthPath } from '../auth/postAuthPath';
import { SesLoader } from '../ui/SesLoader';

const OTP_LENGTH = 6;
const EMPTY_CODE = ' '.repeat(OTP_LENGTH);

function otpDigits(code: string) {
  return code.padEnd(OTP_LENGTH, ' ').slice(0, OTP_LENGTH).split('');
}

export function VerifyEmailPage() {
  const { completeEmailVerification, resendEmailVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as {
    challengeToken?: string;
    email?: string;
    next?: string;
  };
  const [code, setCode] = useState(EMPTY_CODE);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null);

  if (!state.challengeToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-sub">No verification session. Start from signup.</p>
          <Link to="/signup">Back to signup</Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const otp = code.replace(/\s/g, '');
    if (otp.length !== OTP_LENGTH) {
      setError('Enter the full code');
      return;
    }
    setPending('verify');
    setError(null);
    try {
      const auth = await completeEmailVerification(
        state.challengeToken!,
        otp,
      );
      navigate(
        state.next === '/guild' && auth.user.profileComplete
          ? '/guild'
          : postAuthPath(auth.user, auth.org),
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(', ') : msg?.toString() || 'Invalid code',
      );
    } finally {
      setPending(null);
    }
  }

  async function onResend() {
    setInfo(null);
    setError(null);
    setPending('resend');
    try {
      await resendEmailVerification(state.challengeToken!);
      setCode(EMPTY_CODE);
      setInfo('Code resent.');
    } catch {
      setError('Could not resend code');
    } finally {
      setPending(null);
    }
  }

  const shownEmail = state.email ? emailCompact(state.email) : 'your email';

  function onCodeChange(next: string) {
    setCode(next);
    setError(null);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <button type="button" className="auth-back" onClick={() => navigate(-1)}>
          <span className="auth-back-chevron" aria-hidden="true" />
          Back
        </button>
        <h1 className="brand">Verify email</h1>
        <p className="auth-sub">Enter the code sent to {shownEmail}.</p>
        <div className="field">
          <span className="otp-label" id="otp-label">
            Code
          </span>
          <OtpBoxes
            value={code}
            onChange={onCodeChange}
            disabled={pending !== null}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="muted">{info}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending !== null}>
          Verify
        </button>
        <button
          type="button"
          className="otp-resend"
          onClick={onResend}
          disabled={pending !== null}
        >
          Resend code
        </button>
      </form>
      {pending ? <SesLoader label={pending === 'verify' ? 'Verifying' : 'Sending code'} /> : null}
    </div>
  );
}

function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = otpDigits(value);

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))]?.focus();
  }

  function commit(next: string[]) {
    onChange(next.map((digit) => digit.trim() || ' ').join(''));
  }

  function applyDigits(raw: string, start: number) {
    const chars = raw.replace(/\D/g, '').slice(0, OTP_LENGTH - start).split('');
    if (chars.length === 0) return;
    const next = digits.slice();
    chars.forEach((ch, offset) => {
      next[start + offset] = ch;
    });
    commit(next);
    focusAt(Math.min(start + chars.length, OTP_LENGTH - 1));
  }

  return (
    <div className="otp-boxes" role="group" aria-labelledby="otp-label">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className="otp-box"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          maxLength={index === 0 ? OTP_LENGTH : 1}
          value={digit.trim()}
          disabled={disabled}
          autoFocus={index === 0}
          onChange={(e) => {
            const raw = e.target.value;
            if (!raw) {
              const next = digits.slice();
              next[index] = ' ';
              commit(next);
              return;
            }
            applyDigits(raw, index);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              const next = digits.slice();
              if (digit.trim()) {
                next[index] = ' ';
                commit(next);
              } else if (index > 0) {
                next[index - 1] = ' ';
                commit(next);
                focusAt(index - 1);
              }
              return;
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focusAt(index - 1);
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              focusAt(index + 1);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData('text');
            if (!text) return;
            e.preventDefault();
            applyDigits(text, index);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      ))}
    </div>
  );
}
