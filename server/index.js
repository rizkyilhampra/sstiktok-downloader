import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from Vite build in production
if (isProduction) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
}

// Step 1: Get HD download data from ssstik.io
async function getHDDownloadData(tiktokUrl) {
  try {
    const formData = new URLSearchParams();
    formData.append('id', tiktokUrl);
    formData.append('locale', 'en');
    formData.append('tt', 'NnBYZ25k');

    const response = await axios.post('https://ssstik.io/abc?url=dl', formData.toString(), {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'hx-current-url': 'https://ssstik.io/en',
        'hx-request': 'true',
        'hx-target': 'target',
        'hx-trigger': '_gcaptcha_pt',
        'origin': 'https://ssstik.io',
        'referer': 'https://ssstik.io/en',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Try to get HD download button data
    const hdButton = $('#hd_download');
    const dataDirectUrl = hdButton.attr('data-directurl');

    // Extract tt parameter from hidden input
    const ttInput = $('input[name="tt"]');
    const ttValue = ttInput.attr('value');

    if (!dataDirectUrl || !ttValue) {
      // Fallback to standard download if HD not available
      const downloadLink = $('a.without_watermark').attr('href');

      if (!downloadLink) {
        throw new Error('Could not find any download link in response');
      }

      return {
        type: 'standard',
        downloadLink,
        ttValue
      };
    }

    return {
      type: 'hd',
      directUrl: dataDirectUrl,
      ttValue
    };
  } catch (error) {
    console.error('Error getting download data:', error.message);
    throw error;
  }
}

// Step 2: Get hx-redirect URL from second POST request (HD only)
async function getHxRedirectUrl(directUrl, ttValue) {
  try {
    const formData = new URLSearchParams();
    formData.append('tt', ttValue);

    const fullUrl = `https://ssstik.io${directUrl}`;

    const response = await axios.post(fullUrl, formData.toString(), {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'hx-current-url': 'https://ssstik.io/en',
        'hx-request': 'true',
        'hx-target': 'hd_download',
        'hx-trigger': 'hd_download',
        'origin': 'https://ssstik.io',
        'referer': 'https://ssstik.io/en',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const hxRedirect = response.headers['hx-redirect'];

    if (!hxRedirect) {
      throw new Error('Could not find hx-redirect header in response');
    }

    return hxRedirect;
  } catch (error) {
    console.error('Error getting hx-redirect URL:', error.message);
    throw error;
  }
}

// Step 3: Get final video download URL
async function getFinalDownloadUrl(urlOrHash, type = 'hd') {
  try {
    let targetUrl;

    if (type === 'standard') {
      // Extract hash from standard download link
      const hashMatch = urlOrHash.match(/\/ssstik\/([^?]+)/);
      if (!hashMatch) {
        throw new Error('Could not extract hash from download link');
      }
      targetUrl = `https://tikcdn.io/ssstik/${hashMatch[1]}`;
    } else {
      // HD: Use the hx-redirect URL directly
      targetUrl = urlOrHash;
    }

    const response = await axios.get(targetUrl, {
      maxRedirects: 5,
      headers: {
        'Referer': 'https://ssstik.io/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"'
      }
    });

    return response.request.res.responseUrl || targetUrl;
  } catch (error) {
    console.error('Error getting final download URL:', error.message);
    throw error;
  }
}

// API endpoint to download TikTok video
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'TikTok URL is required' });
    }

    // Validate TikTok URL
    if (!url.includes('tiktok.com')) {
      return res.status(400).json({ error: 'Invalid TikTok URL' });
    }

    console.log('Processing TikTok URL:', url);

    // Step 1: Get download data (HD or standard)
    const downloadData = await getHDDownloadData(url);
    console.log(`Download type: ${downloadData.type}`);

    let downloadUrl;

    if (downloadData.type === 'hd') {
      // Step 2: Get hx-redirect URL for HD
      const hxRedirectUrl = await getHxRedirectUrl(downloadData.directUrl, downloadData.ttValue);
      console.log('Got hx-redirect URL');

      // Step 3: Get final download URL
      downloadUrl = await getFinalDownloadUrl(hxRedirectUrl, 'hd');
    } else {
      // Standard quality: direct to final URL
      downloadUrl = await getFinalDownloadUrl(downloadData.downloadLink, 'standard');
    }

    console.log('Final download URL obtained');

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      quality: downloadData.type
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      error: 'Failed to process TikTok video',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve React app for all non-API routes in production
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Mode: ${isProduction ? 'production' : 'development'}`);
  if (!isProduction) {
    console.log('Frontend dev server should be running on http://localhost:5173');
  }
});
