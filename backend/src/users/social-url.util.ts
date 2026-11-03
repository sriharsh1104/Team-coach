/** Platform-only social URL patterns (https required). */

export const WHATSAPP_URL_REGEX =
  /^https:\/\/(wa\.me\/|api\.whatsapp\.com\/|chat\.whatsapp\.com\/|www\.whatsapp\.com\/).+/i;

export const INSTAGRAM_URL_REGEX =
  /^https:\/\/(www\.)?(instagram\.com|instagr\.am)\/.+/i;

export const DISCORD_URL_REGEX =
  /^https:\/\/(www\.)?(discord\.gg\/|discord\.com\/(invite|users|channels)\/|discordapp\.com\/(invite|users|channels)\/).+/i;

export const YOUTUBE_URL_REGEX =
  /^https:\/\/(www\.)?(youtube\.com\/|youtu\.be\/|m\.youtube\.com\/).+/i;

export const SOCIAL_URL_MESSAGES = {
  whatsappUrl: 'WhatsApp link must be a wa.me / whatsapp.com URL',
  instagramUrl: 'Instagram link must be an instagram.com URL',
  discordUrl: 'Discord link must be a discord.gg / discord.com invite URL',
  youtubeUrl: 'YouTube link must be a youtube.com / youtu.be URL',
} as const;
