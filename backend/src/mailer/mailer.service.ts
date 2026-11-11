import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sacred Esports branded shell — dark bg + logo watermark like the web app.
 * Logo loads from WEB_PUBLIC_URL when set; otherwise the wordmark still shows.
 */
function sacredEmailLayout(opts: {
  logoUrl: string | null;
  preheader: string;
  title: string;
  bodyHtml: string;
}): string {
  const logoBlock = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" width="120" height="120" alt="Sacred Esports" style="display:block;margin:0 auto 18px;opacity:0.92;border:0;" />`
    : `<div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#f2f3f5;margin:0 0 18px;">Sacred <span style="color:#c9ccd1;">Esports</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0c;color:#f2f3f5;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121216;border:1px solid rgba(255,255,255,0.10);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;text-align:center;background:radial-gradient(ellipse at 50% 0%, rgba(201,204,209,0.12), transparent 58%), #121216;">
              ${logoBlock}
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9aa0a6;margin-bottom:10px;">Sacred Esports</div>
              <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:700;color:#f2f3f5;">${escapeHtml(opts.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;color:#c9ccd1;font-size:15px;line-height:1.55;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:12px;color:#8b8f97;">
              Sacred Esports · Team Coach
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Talks to Resend's REST API directly over fetch instead of the `resend`
// npm package — same rationale as PushNotificationService's Expo integration:
// one simple POST endpoint, nothing meaningful gained from an SDK dependency.
//
// Reads RESEND_API_KEY/RESEND_FROM_EMAIL lazily per-send (not via getOrThrow
// in the constructor) so a backend without Resend configured yet still boots
// — same deferred-config pattern as StatsAiService/GEMINI_API_KEY.
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
    const fromAddress = this.configService
      .get<string>('RESEND_FROM_EMAIL')
      ?.trim();
    if (!apiKey || !fromAddress) {
      this.logger.warn(
        'RESEND_API_KEY / RESEND_FROM_EMAIL missing — signup OTP and Google password emails will fail until set on this host.',
      );
    } else {
      this.logger.log(`Mailer ready (from: ${fromAddress})`);
    }
  }

  private logoUrl(): string | null {
    const base = (this.configService.get<string>('WEB_PUBLIC_URL') || '')
      .trim()
      .replace(/\/$/, '');
    if (!base) return null;
    // Email clients cannot reach localhost — return null so the text wordmark
    // renders instead of a broken image placeholder.
    if (/localhost|127\.0\.0\.1|\[::1\]/.test(base)) return null;
    return `${base}/sacred-logo-transparent.png`;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
    const fromAddress = this.configService
      .get<string>('RESEND_FROM_EMAIL')
      ?.trim();
    if (!apiKey || !fromAddress) {
      throw new ServiceUnavailableException(
        'Email sending is not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL on the backend.',
      );
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromAddress, to, subject, html }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend API returned ${res.status}: ${text}`);
    }
  }

  sendSignupOtp(to: string, code: string): Promise<void> {
    const safe = escapeHtml(code);
    const html = sacredEmailLayout({
      logoUrl: this.logoUrl(),
      preheader: `Your verification code is ${code}`,
      title: 'Verify Your Email',
      bodyHtml: `
        <p style="margin:0 0 16px;color:#9aa0a6;">Use this code to finish signing up. It expires in 10 minutes.</p>
        <div style="margin:0 auto 18px;padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);text-align:center;">
          <div style="font-size:32px;font-weight:800;letter-spacing:0.28em;color:#f2f3f5;">${safe}</div>
        </div>
        <p style="margin:0;color:#8b8f97;font-size:13px;">If you didn&apos;t request this, you can ignore this email.</p>
      `,
    });
    return this.send(to, 'Verify your email — Sacred Esports', html);
  }

  sendGeneratedPassword(to: string, password: string): Promise<void> {
    const safePassword = escapeHtml(password);
    const safeEmail = escapeHtml(to);
    const html = sacredEmailLayout({
      logoUrl: this.logoUrl(),
      preheader: 'Your Sacred Esports email login password',
      title: 'Your Account Password',
      bodyHtml: `
        <p style="margin:0 0 14px;color:#9aa0a6;">Your account was created with Google sign-in. You can also log in <strong style="color:#f2f3f5;">without Google</strong> using email + password:</p>
        <div style="margin:0 0 12px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9aa0a6;margin-bottom:6px;">Email</div>
          <div style="font-size:16px;font-weight:600;color:#f2f3f5;word-break:break-all;">${safeEmail}</div>
        </div>
        <div style="margin:0 0 18px;padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);text-align:center;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9aa0a6;margin-bottom:8px;">Password</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:0.12em;color:#f2f3f5;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safePassword}</div>
        </div>
        <p style="margin:0 0 10px;color:#c9ccd1;">Change it anytime from <strong style="color:#f2f3f5;">Account → Security</strong> after you sign in.</p>
        <p style="margin:0;color:#8b8f97;font-size:13px;">Keep this email private. Anyone with this password can access your account.</p>
      `,
    });
    return this.send(to, 'Your Sacred Esports account password', html);
  }

  sendPasswordReset(to: string, code: string): Promise<void> {
    const safe = escapeHtml(code);
    const html = sacredEmailLayout({
      logoUrl: this.logoUrl(),
      preheader: `Your password reset code is ${code}`,
      title: 'Reset Your Password',
      bodyHtml: `
        <p style="margin:0 0 16px;color:#9aa0a6;">Use this code to reset your password. It expires in 10 minutes.</p>
        <div style="margin:0 auto 18px;padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);text-align:center;">
          <div style="font-size:32px;font-weight:800;letter-spacing:0.28em;color:#f2f3f5;">${safe}</div>
        </div>
        <p style="margin:0;color:#8b8f97;font-size:13px;">If you didn&apos;t request this, you can ignore this email — your password won&apos;t change.</p>
      `,
    });
    return this.send(to, 'Reset your password — Sacred Esports', html);
  }
}
