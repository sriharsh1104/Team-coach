import { FormEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { PasswordField } from '../auth/PasswordField';
import { emailCompact } from '../auth/emailCompact';
import { SesLoader } from '../ui/SesLoader';

const OTP_LENGTH = 6;
const EMPTY_CODE = ' '.repeat(OTP_LENGTH);

function otpDigits(code: string) {
  return code.padEnd(OTP_LENGTH, ' ').slice(0, OTP_LENGTH).split('');
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as { email?: string };
  const [code, setCode] = useState(EMPTY_CODE);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<'reset' | 'resend' | null>(null);

  if (!state.email) {
    return (
      <div className="auth-shell">
        <div className="brand-watermark auth" aria-hidden="true">
          <img src="/sacred-logo-transparent.png" alt="" />
        </div>
        <div className="auth-card">
          <p className="auth-sub">No reset session. Start from forgot password.</p>
          <Link to="/forgot-password">Back to forgot password</Link>
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
    setPending('reset');
    setError(null);
    try {
      await authApi.resetPassword(state.email!, otp, newPassword);
      navigate('/signin', { state: { passwordResetSuccess: true } });
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
      await authApi.forgotPassword(state.email!);
      setCode(EMPTY_CODE);
      setInfo('Code resent.');
    } catch {
      setError('Could not resend code');
    } finally {
      setPending(null);
    }
  }

  function onCodeChange(next: string) {
    setCode(next);
    setError(null);
  }

  return (
    <div className="auth-shell">
      <div className="brand-watermark auth" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <button type="button" className="auth-back" onClick={() => navigate(-1)}>
          <span className="auth-back-chevron" aria-hidden="true" />
          Back
        </button>
        <h1 className="brand">Reset password</h1>
        <p className="auth-sub">
          Enter the code sent to {emailCompact(state.email)} and choose a new
          password.
        </p>
        <div className="field">
          <span className="otp-label" id="otp-label">
            Code
          </span>
          <OtpBoxes value={code} onChange={onCodeChange} disabled={pending !== null} />
        </div>
        <PasswordField
          id="newPassword"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          minLength={8}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="muted">{info}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending !== null}>
          Reset password
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
      {pending ? (
        <SesLoader label={pending === 'reset' ? 'Resetting' : 'Sending code'} />
      ) : null}
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
