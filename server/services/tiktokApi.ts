import axios from 'axios';
import * as cheerio from 'cheerio';
import { STEP_TIMEOUT_MS, BROWSER_UA } from '../utils/retry.js';

const COMMON_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/x-www-form-urlencoded',
  'hx-current-url': 'https://ssstik.io/en',
  'hx-request': 'true',
  'origin': 'https://ssstik.io',
  'referer': 'https://ssstik.io/en',
  'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': BROWSER_UA,
};

export interface HdDownloadData {
  directUrl: string;
  ttValue: string;
  author: string;
  description: string;
}

export async function getHDDownloadData(tiktokUrl: string): Promise<HdDownloadData> {
  const formData = new URLSearchParams();
  formData.append('id', tiktokUrl);
  formData.append('locale', 'en');
  formData.append('tt', 'NnBYZ25k');

  const response = await axios.post<string>('https://ssstik.io/abc?url=dl', formData.toString(), {
    headers: { ...COMMON_HEADERS, 'hx-target': 'target', 'hx-trigger': '_gcaptcha_pt' },
    timeout: STEP_TIMEOUT_MS,
  });

  const $ = cheerio.load(response.data);
  const author = $('.result_overlay h2').text().trim() || 'unknown';
  const description = $('.result_overlay p.maintext').text().trim() || 'video';

  const hdButton = $('#hd_download');
  const dataDirectUrl = hdButton.attr('data-directurl');
  const ttValue = $('input[name="tt"]').attr('value');

  if (!dataDirectUrl || !ttValue) {
    throw new Error('HD download not available for this video');
  }

  return { directUrl: dataDirectUrl, ttValue, author, description };
}

export async function getHxRedirectUrl(directUrl: string, ttValue: string): Promise<string> {
  const formData = new URLSearchParams();
  formData.append('tt', ttValue);

  const response = await axios.post<string>(`https://ssstik.io${directUrl}`, formData.toString(), {
    headers: { ...COMMON_HEADERS, 'hx-target': 'hd_download', 'hx-trigger': 'hd_download' },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    timeout: STEP_TIMEOUT_MS,
  });

  const hxRedirect = response.headers['hx-redirect'] as string | undefined;
  if (!hxRedirect) {
    throw new Error('Could not find hx-redirect header in response');
  }

  return hxRedirect;
}

export async function getFinalDownloadUrl(urlOrHash: string): Promise<string> {
  const base64Match = urlOrHash.match(/\/ssstik\/([^?]+)/);
  const targetUrl = base64Match
    ? Buffer.from(base64Match[1], 'base64').toString('utf-8')
    : urlOrHash;
  console.log('Decoded video URL:', targetUrl);

  const response = await axios.get(targetUrl, {
    maxRedirects: 5,
    timeout: STEP_TIMEOUT_MS,
    headers: {
      'Referer': 'https://ssstik.io/',
      'User-Agent': BROWSER_UA,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
    },
  });

  const responseUrl = (response.request as { res?: { responseUrl?: string } }).res?.responseUrl;
  return responseUrl ?? targetUrl;
}
