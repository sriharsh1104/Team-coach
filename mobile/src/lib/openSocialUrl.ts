import { Alert, Linking } from 'react-native';

export type SocialOpenPlatform =
  | 'email'
  | 'whatsapp'
  | 'instagram'
  | 'discord'
  | 'youtube'
  | 'telegram'
  | 'web';

/** Infer platform from a stored / displayed URL. */
export function detectSocialPlatform(url: string): SocialOpenPlatform {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('mailto:')) return 'email';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return 'email';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (
    lower.includes('discord.gg') ||
    lower.includes('discord.com') ||
    lower.includes('discordapp.com')
  ) {
    return 'discord';
  }
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (
    lower.includes('t.me') ||
    lower.includes('telegram.me') ||
    lower.includes('telegram.org')
  ) {
    return 'telegram';
  }
  if (lower.includes('wa.me') || lower.includes('whatsapp.com')) return 'whatsapp';
  return 'web';
}

function ensureHttpUrl(url: string): string {
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:')
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Native app deep link for a social https URL, or null when we only have web.
 * OS opens the app when installed; callers fall back to the https URL (default browser).
 */
export function socialAppDeepLink(
  platform: SocialOpenPlatform,
  webUrl: string,
): string | null {
  if (platform === 'email' || platform === 'web') return null;

  let parsed: URL;
  try {
    parsed = new URL(ensureHttpUrl(webUrl));
  } catch {
    return null;
  }

  switch (platform) {
    case 'instagram': {
      const segment = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
      if (
        !segment ||
        ['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(segment)
      ) {
        return null;
      }
      return `instagram://user?username=${encodeURIComponent(segment)}`;
    }
    case 'youtube': {
      if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace(/^\/+|\/+$/g, '');
        return id ? `vnd.youtube:${id}` : null;
      }
      return `vnd.youtube://${parsed.host}${parsed.pathname}${parsed.search}`;
    }
    case 'discord': {
      if (parsed.hostname.includes('discord.gg')) {
        const code = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
        return code ? `discord://invite/${code}` : null;
      }
      const invite = parsed.pathname.match(/\/invite\/([^/]+)/i);
      return invite ? `discord://invite/${invite[1]}` : null;
    }
    case 'telegram': {
      const host = parsed.hostname.replace(/^www\./, '');
      if (host === 't.me' || host === 'telegram.me') {
        const user = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
        if (!user || user === 'share' || user === 'joinchat') return null;
        return `tg://resolve?domain=${encodeURIComponent(user)}`;
      }
      return null;
    }
    case 'whatsapp': {
      if (parsed.hostname.includes('wa.me')) {
        const phone = parsed.pathname.replace(/\D/g, '');
        return phone ? `whatsapp://send?phone=${phone}` : null;
      }
      const phoneParam = parsed.searchParams.get('phone');
      if (phoneParam) {
        return `whatsapp://send?phone=${phoneParam.replace(/\D/g, '')}`;
      }
      if (parsed.hostname.includes('chat.whatsapp.com')) {
        const code = parsed.pathname.replace(/^\/+|\/+$/g, '');
        return code ? `whatsapp://chat?code=${code}` : null;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Prefer the native app when installed; otherwise open in the user's default browser.
 */
export async function openSocialUrl(
  url: string,
  platform?: SocialOpenPlatform,
): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  const resolvedPlatform = platform ?? detectSocialPlatform(trimmed);
  const webUrl =
    resolvedPlatform === 'email' && !trimmed.startsWith('mailto:')
      ? `mailto:${trimmed}`
      : ensureHttpUrl(trimmed);

  const appUrl = socialAppDeepLink(resolvedPlatform, webUrl);
  if (appUrl) {
    try {
      // canOpenURL is accurate once iOS query schemes / Android package
      // visibility are declared (see app.config + withSocialPackageQueries).
      const can = await Linking.canOpenURL(appUrl);
      if (can) {
        await Linking.openURL(appUrl);
        return;
      }
    } catch {
      // Unknown — try the app scheme once, then browser.
      try {
        await Linking.openURL(appUrl);
        return;
      } catch {
        // fall through to default browser
      }
    }
  }

  try {
    await Linking.openURL(webUrl);
  } catch {
    Alert.alert('Could not open', trimmed);
  }
}
