import {
  isDisallowedAddress,
  isDisallowedHostname,
  isFetchableUrl,
  parseOpenGraph,
} from './link-preview.util';

describe('link-preview SSRF guards', () => {
  it('blocks loopback, private, and link-local (incl. cloud metadata) IPv4 addresses', () => {
    expect(isDisallowedAddress('127.0.0.1')).toBe(true);
    expect(isDisallowedAddress('10.0.0.5')).toBe(true);
    expect(isDisallowedAddress('172.16.0.1')).toBe(true);
    expect(isDisallowedAddress('172.31.255.255')).toBe(true);
    expect(isDisallowedAddress('192.168.1.1')).toBe(true);
    expect(isDisallowedAddress('169.254.169.254')).toBe(true); // AWS/GCP metadata
    expect(isDisallowedAddress('0.0.0.0')).toBe(true);
  });

  it('allows ordinary public IPv4 addresses', () => {
    expect(isDisallowedAddress('8.8.8.8')).toBe(false);
    expect(isDisallowedAddress('1.1.1.1')).toBe(false);
    expect(isDisallowedAddress('172.32.0.1')).toBe(false); // just outside the 172.16-31 private block
    expect(isDisallowedAddress('172.15.255.255')).toBe(false);
  });

  it('blocks IPv6 loopback, link-local and unique-local, and IPv4-mapped private addresses', () => {
    expect(isDisallowedAddress('::1')).toBe(true);
    expect(isDisallowedAddress('fe80::1')).toBe(true);
    expect(isDisallowedAddress('fd00::1')).toBe(true);
    expect(isDisallowedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isDisallowedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks localhost and reserved internal-looking hostnames outright', () => {
    expect(isDisallowedHostname('localhost')).toBe(true);
    expect(isDisallowedHostname('LOCALHOST')).toBe(true);
    expect(isDisallowedHostname('router.local')).toBe(true);
    expect(isDisallowedHostname('db.internal')).toBe(true);
    expect(isDisallowedHostname('127.0.0.1')).toBe(true);
    expect(isDisallowedHostname('example.com')).toBe(false);
  });

  it('only accepts http(s) URLs, rejecting other schemes', () => {
    expect(isFetchableUrl('https://example.com/post')?.hostname).toBe('example.com');
    expect(isFetchableUrl('http://example.com')?.hostname).toBe('example.com');
    expect(isFetchableUrl('file:///etc/passwd')).toBeNull();
    expect(isFetchableUrl('javascript:alert(1)')).toBeNull();
    expect(isFetchableUrl('data:text/html,hi')).toBeNull();
    expect(isFetchableUrl('not a url at all')).toBeNull();
  });
});

describe('parseOpenGraph', () => {
  it('extracts og:title/description/image, resolving a relative image against the source URL', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Cool Article">
        <meta property="og:description" content="A thing happened &amp; it was neat">
        <meta property="og:image" content="/images/cover.jpg">
        <meta property="og:site_name" content="Example News">
      </head></html>
    `;
    const data = parseOpenGraph(html, 'https://news.example.com/article/1');
    expect(data).toMatchObject({
      title: 'Cool Article',
      description: 'A thing happened & it was neat',
      image: 'https://news.example.com/images/cover.jpg',
      siteName: 'Example News',
    });
  });

  it('falls back to <title> when there is no og:title', () => {
    const html = '<html><head><title>Plain Page Title</title></head></html>';
    const data = parseOpenGraph(html, 'https://example.com');
    expect(data.title).toBe('Plain Page Title');
    expect(data.image).toBeNull();
  });

  it('handles content-before-property attribute order', () => {
    const html = '<meta content="Reversed order title" property="og:title">';
    const data = parseOpenGraph(html, 'https://example.com');
    expect(data.title).toBe('Reversed order title');
  });

  it('returns all-null fields for a page with no usable metadata, without throwing', () => {
    const data = parseOpenGraph('<html><body>hi</body></html>', 'https://example.com');
    expect(data.title).toBeNull();
    expect(data.description).toBeNull();
    expect(data.image).toBeNull();
  });

  it('truncates very long title/description rather than ballooning the push/DB payload', () => {
    const longTitle = 'x'.repeat(500);
    const html = `<meta property="og:title" content="${longTitle}">`;
    const data = parseOpenGraph(html, 'https://example.com');
    expect(data.title?.length).toBe(200);
  });
});
