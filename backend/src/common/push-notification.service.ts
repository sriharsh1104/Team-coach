import { Injectable } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Talks to Expo's push API directly over HTTP instead of using the
// `expo-server-sdk` package — that package ships ESM-only with an
// `import.meta.url` reference deep inside, which can't be transpiled to
// CommonJS, so it broke under Jest/ts-jest in the e2e test suite even though
// it ran fine in the live app (Nest's own bundler handles ESM interop
// differently). The API itself is one simple POST endpoint, so there's
// nothing meaningful lost by calling it directly.
const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[.+\]$/;
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

@Injectable()
export class PushNotificationService {
  isValidExpoPushToken(token: string | null | undefined): token is string {
    return typeof token === 'string' && EXPO_PUSH_TOKEN_REGEX.test(token);
  }

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_REQUEST) {
      const chunk = messages
        .slice(i, i + MAX_MESSAGES_PER_REQUEST)
        .map((m) => ({ ...m, sound: 'default' as const }));

      const res = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Expo push API returned ${res.status}: ${text}`);
      }
    }
  }
}
