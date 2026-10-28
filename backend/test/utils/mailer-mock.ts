// Captures what the real MailerService would have sent instead of calling
// Resend's network API — keeps the e2e suite fast/offline and gives fixtures
// a way to read back the OTP/password a test flow needs to continue with.
export const sentOtps = new Map<string, string>();
export const sentPasswords = new Map<string, string>();

export class MockMailerService {
  async sendSignupOtp(to: string, code: string): Promise<void> {
    sentOtps.set(to, code);
  }

  async sendGeneratedPassword(to: string, password: string): Promise<void> {
    sentPasswords.set(to, password);
  }
}
