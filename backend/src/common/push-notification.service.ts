import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parsePushTokens, removePushToken } from './push-tokens';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Collapse same-channel pushes into one tray entry that updates the count. */
  collapseId?: string;
  /** Android notification channel (must match client setNotificationChannelAsync). */
  channelId?: string;
  /** iOS / Android action category (e.g. reply-from-shade). */
  categoryId?: string;
  /** iOS app icon badge. */
  badge?: number;
  /** Android delivery priority — high wakes Doze promptly. */
  priority?: 'default' | 'normal' | 'high';
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
  collapseId?: string;
  channelId?: string;
  categoryId?: string;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
};

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

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
// Expo rejects a whole request when its tokens belong to different Expo
// projects (e.g. phones still running an APK built under an older EAS
// account/owner next to phones on the current one).
const MIXED_PROJECTS_CODE = 'PUSH_TOO_MANY_EXPERIENCE_IDS';
const DEAD_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  /** token → Expo project ("@owner/slug"), learned from Expo's mixed-project errors. */
  private readonly projectByToken = new Map<string, string>();
  /** Tokens Expo already said are dead — skip until the process restarts. */
  private readonly deadTokens = new Set<string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  isValidExpoPushToken(token: string | null | undefined): token is string {
    return typeof token === 'string' && EXPO_PUSH_TOKEN_REGEX.test(token);
  }

  /** Expand a user's stored token field (may be pipe-separated multi-device). */
  tokensFor(raw: string | null | undefined): string[] {
    return parsePushTokens(raw).filter(
      (t) => this.isValidExpoPushToken(t) && !this.deadTokens.has(t),
    );
  }

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    // Keep tokens we already know belong together in the same request, so
    // after the first mixed-project rejection we stop paying for it.
    const byProject = new Map<string, ExpoMessage[]>();
    for (const m of messages) {
      if (this.deadTokens.has(m.to)) continue;
      const key = this.projectByToken.get(m.to) ?? '';
      const list = byProject.get(key) ?? [];
      list.push({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default' as const,
        priority: m.priority ?? 'high',
        ...(m.collapseId ? { collapseId: m.collapseId } : {}),
        ...(m.channelId ? { channelId: m.channelId } : {}),
        ...(m.categoryId ? { categoryId: m.categoryId } : {}),
        ...(typeof m.badge === 'number' ? { badge: m.badge } : {}),
      });
      byProject.set(key, list);
    }

    // One failing group must not stop the others from being notified.
    let firstError: Error | null = null;
    for (const group of byProject.values()) {
      for (let i = 0; i < group.length; i += MAX_MESSAGES_PER_REQUEST) {
        try {
          await this.sendChunk(group.slice(i, i + MAX_MESSAGES_PER_REQUEST));
        } catch (err) {
          firstError ??= err as Error;
        }
      }
    }
    if (firstError) throw firstError;
  }

  private async sendChunk(chunk: ExpoMessage[]): Promise<void> {
    const res = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });

    const text = await res.text().catch(() => '');
    // Expo returns 200 even when a per-message delivery fails (stale token,
    // FCM credentials issue, etc.) — that detail is inside this response
    // body, not the HTTP status, so log it every time.
    console.log(
      `[push] to=${chunk.map((m) => m.to).join(',')} status=${res.status} response=${text}`,
    );

    if (res.ok) {
      await this.pruneFromTickets(chunk, text);
      return;
    }

    if (res.status === 400 && chunk.length > 1 && text.includes(MIXED_PROJECTS_CODE)) {
      const groups = this.splitByProject(chunk, text);
      let firstError: Error | null = null;
      for (const group of groups) {
        try {
          await this.sendChunk(group);
        } catch (err) {
          firstError ??= err as Error;
        }
      }
      if (firstError) throw firstError;
      return;
    }

    throw new Error(`Expo push API returned ${res.status}: ${text}`);
  }

  /**
   * Drop DeviceNotRegistered / InvalidCredentials tokens so a dead phone
   * (old APK, uninstalled, FCM revoked) does not keep filling the multi-device
   * list and crowd out a working device.
   */
  private async pruneFromTickets(chunk: ExpoMessage[], body: string): Promise<void> {
    let tickets: ExpoTicket[] = [];
    try {
      const parsed = JSON.parse(body) as { data?: ExpoTicket[] };
      tickets = Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return;
    }
    const dead: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = chunk[i]?.to;
      if (!token || ticket?.status !== 'error') continue;
      const code = ticket.details?.error;
      if (code && DEAD_TOKEN_ERRORS.has(code)) dead.push(token);
    }
    if (dead.length === 0) return;
    for (const t of dead) this.deadTokens.add(t);
    if (!this.prisma) return;
    for (const token of dead) {
      try {
        const users = await this.prisma.user.findMany({
          where: { expoPushToken: { contains: token } },
          select: { id: true, expoPushToken: true },
        });
        for (const u of users) {
          await this.prisma.user.update({
            where: { id: u.id },
            data: { expoPushToken: removePushToken(u.expoPushToken, token) },
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to prune dead push token: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Expo's error lists which tokens belong to which project, e.g.
   * details: { "@owner-a/app": [tokenA], "@owner-b/app": [tokenB] }.
   * Split along those lines (and remember them); if the body can't be
   * understood, fall back to one request per message so nobody is dropped.
   */
  private splitByProject(chunk: ExpoMessage[], body: string): ExpoMessage[][] {
    try {
      const parsed = JSON.parse(body) as {
        errors?: Array<{ code?: string; details?: Record<string, unknown> }>;
      };
      const details = parsed.errors?.find((e) => e.code === MIXED_PROJECTS_CODE)?.details;
      if (details && typeof details === 'object') {
        const byToken = new Map<string, string>();
        for (const [project, tokens] of Object.entries(details)) {
          if (!Array.isArray(tokens)) continue;
          for (const t of tokens) {
            if (typeof t === 'string') byToken.set(t, project);
          }
        }
        const groups = new Map<string, ExpoMessage[]>();
        for (const m of chunk) {
          const project = byToken.get(m.to) ?? '';
          if (project) this.projectByToken.set(m.to, project);
          const list = groups.get(project) ?? [];
          list.push(m);
          groups.set(project, list);
        }
        // Only trust the split if it actually made the problem smaller.
        if (groups.size > 1) return [...groups.values()];
      }
    } catch {
      // fall through to one-by-one
    }
    return chunk.map((m) => [m]);
  }
}
