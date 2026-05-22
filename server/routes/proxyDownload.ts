import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Readable } from 'stream';
import axios from 'axios';
import dns from 'dns/promises';
import net from 'net';
import { getJob } from '../services/jobStore.js';
import { config } from '../config.js';

const router = Router();

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  // 0.0.0.0/8
  if ((n & 0xff000000) === 0x00000000) return true;
  // 10.0.0.0/8
  if ((n & 0xff000000) === 0x0a000000) return true;
  // 127.0.0.0/8
  if ((n & 0xff000000) === 0x7f000000) return true;
  // 169.254.0.0/16 (link-local, includes 169.254.169.254 cloud metadata)
  if ((n & 0xffff0000) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if ((n & 0xfff00000) === 0xac100000) return true;
  // 192.0.0.0/24, 192.0.2.0/24
  if ((n & 0xffffff00) === 0xc0000000) return true;
  if ((n & 0xffffff00) === 0xc0000200) return true;
  // 192.168.0.0/16
  if ((n & 0xffff0000) === 0xc0a80000) return true;
  // 198.18.0.0/15
  if ((n & 0xfffe0000) === 0xc6120000) return true;
  // 198.51.100.0/24
  if ((n & 0xffffff00) === 0xc6336400) return true;
  // 203.0.113.0/24
  if ((n & 0xffffff00) === 0xcb007100) return true;
  // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved
  if ((n & 0xf0000000) === 0xe0000000) return true;
  if ((n & 0xf0000000) === 0xf0000000) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // fc00::/7 unique local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
}

async function resolveSafely(hostname: string): Promise<{ ok: true; ips: string[] } | { ok: false; reason: string }> {
  // Literal IPs in the URL skip DNS but still need checking.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) return { ok: false, reason: `literal private IP ${hostname}` };
    return { ok: true, ips: [hostname] };
  }
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch (err) {
    return { ok: false, reason: `dns lookup failed: ${(err as Error).message}` };
  }
  const ips = addrs.map((a) => a.address);
  const bad = ips.find(isPrivateIp);
  if (bad) return { ok: false, reason: `resolves to private IP ${bad}` };
  return { ok: true, ips };
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\x00-\x1f"\\/\r\n]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'tiktok-video.mp4';
}

function encodeContentDisposition(name: string): string {
  const safe = sanitizeFilename(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

router.get('/', async (req: Request, res: Response) => {
  const { jobId, filename } = req.query as { jobId?: string; filename?: string };

  if (!jobId || typeof jobId !== 'string') {
    res.status(400).json({ error: 'jobId is required' });
    return;
  }

  let job;
  try {
    job = await getJob(jobId);
  } catch (error) {
    console.error('Failed to read job for proxy download:', (error as Error).message);
    res.status(503).json({ error: 'Job store is unavailable' });
    return;
  }
  if (!job || job.status !== 'completed' || !job.downloadUrl) {
    res.status(400).json({ error: 'Job not found, not completed, or has no download URL' });
    return;
  }

  const url = job.downloadUrl;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[proxy-download] BLOCKED unparseable url jobId=${jobId}`);
    res.status(400).json({ error: 'Upstream URL is invalid' });
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    console.warn(`[proxy-download] BLOCKED non-http protocol="${parsed.protocol}" jobId=${jobId}`);
    res.status(400).json({ error: 'Upstream protocol not allowed' });
    return;
  }

  const upstreamHost = parsed.hostname.toLowerCase();
  const resolution = await resolveSafely(upstreamHost);
  if (!resolution.ok) {
    console.warn(`[proxy-download] BLOCKED upstream host="${upstreamHost}" jobId=${jobId} reason="${resolution.reason}"`);
    res.status(400).json({ error: 'Upstream host not allowed' });
    return;
  }
  console.log(`[proxy-download] ALLOW upstream host="${upstreamHost}" ips=${resolution.ips.join(',')} jobId=${jobId}`);

  const finalFilename = sanitizeFilename(filename || job.filename || 'tiktok-video.mp4');

  const upstreamHeaders: Record<string, string> = {
    Referer: 'https://ssstik.io/',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  if (req.headers.range) {
    upstreamHeaders.Range = req.headers.range;
  }

  let upstream;
  try {
    upstream = await axios.get<Readable>(url, {
      responseType: 'stream',
      timeout: 30_000,
      headers: upstreamHeaders,
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 400,
    });
  } catch (error) {
    console.error('Error proxying download:', (error as Error).message);
    res.status(502).json({ error: 'Failed to download video' });
    return;
  }

  const contentLengthRaw = upstream.headers['content-length'];
  const contentLength = contentLengthRaw !== undefined ? Number(contentLengthRaw) : NaN;
  if (Number.isFinite(contentLength) && contentLength > config.maxProxyBytes) {
    console.error('Upstream content-length exceeds limit:', contentLength);
    upstream.data.destroy();
    res.status(413).json({ error: 'Upstream file exceeds size limit' });
    return;
  }

  const stream: Readable = upstream.data;
  const cleanup = () => {
    if (!stream.destroyed) stream.destroy();
  };

  let streamed = 0;
  stream.on('data', (chunk: Buffer) => {
    streamed += chunk.length;
    if (streamed > config.maxProxyBytes) {
      console.error('Upstream stream exceeded byte limit:', streamed);
      cleanup();
      if (!res.headersSent) {
        res.status(413).json({ error: 'Upstream file exceeds size limit' });
      } else {
        res.destroy();
      }
    }
  });
  stream.on('error', (err: Error) => {
    console.error('upstream stream error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream stream error' });
    } else {
      res.destroy(err);
    }
  });
  res.on('error', (err: Error) => {
    console.error('response stream error:', err.message);
    cleanup();
  });
  req.on('close', cleanup);

  res.status(upstream.status);
  res.setHeader('Content-Type', String(upstream.headers['content-type'] ?? 'video/mp4'));
  res.setHeader('Content-Disposition', encodeContentDisposition(finalFilename));
  res.setHeader('Accept-Ranges', String(upstream.headers['accept-ranges'] ?? 'bytes'));
  if (contentLengthRaw !== undefined) {
    res.setHeader('Content-Length', String(contentLengthRaw));
  }
  const contentRange = upstream.headers['content-range'];
  if (contentRange !== undefined) {
    res.setHeader('Content-Range', String(contentRange));
  }

  stream.pipe(res);
});

export default router;
