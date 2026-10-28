import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_API_URL = 'https://api.resend.com/emails';

// Talks to Resend's REST API directly over fetch instead of the `resend`
// npm package — same rationale as PushNotificationService's Expo integration:
// one simple POST endpoint, nothing meaningful gained from an SDK dependency.
//
// Reads RESEND_API_KEY/RESEND_FROM_EMAIL lazily per-send (not via getOrThrow
// in the constructor) so a backend without Resend configured yet still boots
// — same deferred-config pattern as StatsAiService/ANTHROPIC_API_KEY.
@Injectable()
export class MailerService {
  constructor(private readonly configService: ConfigService) {}

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromAddress = this.configService.get<string>('RESEND_FROM_EMAIL');
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
    return this.send(
      to,
      'Verify your email — Team Coach',
      `<p>Your Team Coach verification code is:</p>
       <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
       <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    );
  }

  sendGeneratedPassword(to: string, password: string): Promise<void> {
    return this.send(
      to,
      'Your Team Coach account password',
      `<p>Your Team Coach account was created using Google sign-in.</p>
       <p>You can also log in directly with your email and this password:</p>
       <p style="font-size: 20px; font-weight: 700; letter-spacing: 2px;">${password}</p>
       <p>We recommend changing it from Account Settings after you log in.</p>`,
    );
  }
}
