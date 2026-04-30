import axios from 'axios';
import { STEP_TIMEOUT_MS, BROWSER_UA } from './retry.js';

export async function extractUsernameFromUrl(url: string): Promise<string | null> {
  try {
    console.log('Fetching TikTok page to extract username from embedded data...');
    const response = await axios.get<string>(url, {
      headers: { 'User-Agent': BROWSER_UA },
      maxRedirects: 5,
      timeout: STEP_TIMEOUT_MS,
    });

    const html = response.data;
    const scriptMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s,
    );
    if (scriptMatch) {
      const jsonStr = scriptMatch[1];

      const canonicalMatch = jsonStr.match(
        /"canonical":"https:\\u002F\\u002Fwww\.tiktok\.com\\u002F@([^\\]+)\\u002Fvideo/,
      );
      if (canonicalMatch) {
        console.log('Extracted username from canonical URL:', canonicalMatch[1]);
        return canonicalMatch[1];
      }

      try {
        const data = JSON.parse(jsonStr) as Record<string, unknown>;
        const scope = data['__DEFAULT_SCOPE__'] as Record<string, unknown> | undefined;
        const videoDetail = scope?.['webapp.video-detail'] as Record<string, unknown> | undefined;
        const itemInfo = videoDetail?.['itemInfo'] as Record<string, unknown> | undefined;
        const itemStruct = itemInfo?.['itemStruct'] as Record<string, unknown> | undefined;
        const author = itemStruct?.['author'] as Record<string, unknown> | undefined;
        const username = author?.['uniqueId'];
        if (typeof username === 'string') {
          console.log('Extracted username from author.uniqueId:', username);
          return username;
        }
      } catch (e) {
        console.error('Failed to parse embedded JSON:', (e as Error).message);
      }
    }
  } catch (error) {
    console.error('Error extracting username from URL:', (error as Error).message);
  }

  return null;
}

const sanitize = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

export async function createFilename(author: string, tiktokUrl: string | null = null): Promise<string> {
  let sanitizedAuthor = sanitize(author ?? '');

  if (!sanitizedAuthor && tiktokUrl) {
    console.log('Author name is empty (likely emojis), attempting to extract username from URL...');
    const username = await extractUsernameFromUrl(tiktokUrl);
    if (username) sanitizedAuthor = sanitize(username);
  }

  if (!sanitizedAuthor) sanitizedAuthor = 'unknown';

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .substring(0, 17);

  return `${sanitizedAuthor}-${timestamp}.mp4`;
}
