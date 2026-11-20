import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import {
  isDisallowedAddress,
  isDisallowedHostname,
  isFetchableUrl,
  LinkPreviewData,
  parseOpenGraph,
} from './link-preview.util';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — shared links get requested repeatedly
const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 512 * 1024; // OG tags are always near the top of <head>
const USER_AGENT =
  'Mozilla/5.0 (compatible; SacredEsportsBot/1.0; +https://sacredesports.com)';

/**
 * Chat link previews: fetches a shared URL server-side and scrapes its
 * Open Graph metadata. Everything here is about *not becoming an SSRF
 * proxy* — a user pasting a link is attacker-controlled input to an
 * outbound server-side request:
 *   - only http(s), no file:/javascript:/data:
 *   - hostname checked, then the DNS-RESOLVED address checked again
 *     (blocks "evil.com" that resolves to 127.0.0.1 / 169.254.169.254 / etc.
 *     — DNS rebinding), before any request is made
 *   - redirects are not followed (manual) so a 3xx can't repoint to an
 *     internal address past the check
 *   - response body size and total time are both capped
 */
@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);
  private readonly cache = new Map<string, { data: LinkPreviewData; expiresAt: number }>();

  async fetchPreview(rawUrl: string): Promise<LinkPreviewData> {
    const url = isFetchableUrl(rawUrl);
    if (!url) {
      throw new BadRequestException('Not a fetchable http(s) URL');
    }
    if (isDisallowedHostname(url.hostname)) {
      throw new BadRequestException('That URL cannot be previewed');
    }

    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let address: string;
    try {
      address = (await lookup(url.hostname)).address;
    } catch {
      throw new BadRequestException('Could not resolve that host');
    }
    if (isDisallowedAddress(address)) {
      throw new BadRequestException('That URL cannot be previewed');
    }

    const data = await this.fetchAndParse(url);
    this.cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  private async fetchAndParse(url: URL): Promise<LinkPreviewData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        // Don't auto-follow — a redirect could repoint past our SSRF check.
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      if (res.status >= 300 && res.status < 400) {
        throw new BadRequestException(
          'That link redirects — try sharing the final URL directly',
        );
      }
      if (!res.ok) {
        throw new BadRequestException(`Could not load that page (${res.status})`);
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        throw new BadRequestException('That URL is not a web page');
      }
      const html = await this.readCapped(res, MAX_RESPONSE_BYTES);
      return parseOpenGraph(html, url.toString());
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Link preview fetch failed for ${url.hostname}: ${(err as Error).message}`);
      throw new BadRequestException('Could not load a preview for that link');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCapped(res: globalThis.Response, maxBytes: number): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        chunks.push(value);
        if (total >= maxBytes) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  }
}
