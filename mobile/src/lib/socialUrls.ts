export type SocialPlatform = 'whatsapp' | 'instagram' | 'discord' | 'youtube';

const PATTERNS: Record<SocialPlatform, RegExp> = {
  whatsapp:
    /^https:\/\/(wa\.me\/|api\.whatsapp\.com\/|chat\.whatsapp\.com\/|www\.whatsapp\.com\/).+/i,
  instagram: /^https:\/\/(www\.)?(instagram\.com|instagr\.am)\/.+/i,
  discord:
    /^https:\/\/(www\.)?(discord\.gg\/|discord\.com\/(invite|users|channels)\/|discordapp\.com\/(invite|users|channels)\/).+/i,
  youtube: /^https:\/\/(www\.)?(youtube\.com\/|youtu\.be\/|m\.youtube\.com\/).+/i,
};

const MESSAGES: Record<SocialPlatform, string> = {
  whatsapp: 'Use a WhatsApp link (wa.me / whatsapp.com).',
  instagram: 'Use an Instagram link (instagram.com).',
  discord: 'Use a Discord link (discord.gg / discord.com).',
  youtube: 'Use a YouTube link (youtube.com / youtu.be).',
};

export const SOCIAL_PLACEHOLDERS: Record<SocialPlatform, string> = {
  whatsapp: 'https://wa.me/91XXXXXXXXXX',
  instagram: 'https://instagram.com/username',
  discord: 'https://discord.gg/invite',
  youtube: 'https://youtube.com/@channel',
};

export function validateSocialUrl(
  platform: SocialPlatform,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!PATTERNS[platform].test(trimmed)) return MESSAGES[platform];
  return null;
}

export function validateAllSocialUrls(values: Record<SocialPlatform, string>) {
  for (const platform of Object.keys(PATTERNS) as SocialPlatform[]) {
    const err = validateSocialUrl(platform, values[platform] ?? '');
    if (err) return err;
  }
  return null;
}
