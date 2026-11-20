import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

const ROOM_ID = /^[A-Za-z0-9_-]{4,64}$/;
const APP_PACKAGE = 'com.teamcoach.app';
const APP_SCHEME = 'teamcoach';

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Public landing page behind the shared game invite link.
 *
 * WhatsApp / Discord / Telegram only make https links tappable — a bare
 * `teamcoach://` link shows as plain text. So the shared link is
 * `https://<api>/games/join/<roomId>`; opening it bounces straight into the
 * app (Android intent / custom scheme), where GameInviteBridge navigates to
 * the room and the room screen joins it. The page holds no private data: the
 * room id is already in the link, and the app still checks guild membership
 * on the games socket before letting anyone in.
 */
@Controller('games')
export class GamesLinkController {
  @Get('join/:roomId')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  join(@Param('roomId') roomId: string, @Res() res: Response) {
    // helmet's default CSP blocks the one inline redirect script this page needs.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
    if (!ROOM_ID.test(roomId)) {
      return res.status(404).send(this.page('Invalid invite link', '', null));
    }
    const downloadUrl = process.env.APP_DOWNLOAD_URL?.trim() || null;
    return res.send(this.page('You are invited to play', roomId, downloadUrl));
  }

  private page(title: string, roomId: string, downloadUrl: string | null) {
    const scheme = `${APP_SCHEME}://games/room/${roomId}`;
    const intent = `intent://games/room/${roomId}#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};end`;
    const body = roomId
      ? `<p>Opening Sacred Esports…</p>
<a class="btn" id="open" href="${esc(scheme)}">Open the game</a>
${
  downloadUrl
    ? `<p class="hint">App not installed? <a href="${esc(downloadUrl)}">Download it</a>, sign in, then tap this link again.</p>`
    : '<p class="hint">App not installed? Install Sacred Esports, sign in, then tap this link again.</p>'
}
<script>
(function () {
  var android = /Android/i.test(navigator.userAgent);
  var target = android ? ${JSON.stringify(intent)} : ${JSON.stringify(scheme)};
  document.getElementById('open').setAttribute('href', target);
  setTimeout(function () { window.location.href = target; }, 150);
})();
</script>`
      : '<p>This game link is not valid.</p>';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0a0a0c;color:#e8e9ec;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:22px;margin:0}
.btn{background:#23a559;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px}
.hint{color:#9aa0a6;font-size:14px;max-width:320px}
.hint a{color:#8ab4f8}
</style></head><body>
<h1>🎮 ${esc(title)}</h1>
${body}
</body></html>`;
  }
}
