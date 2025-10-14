const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Step 1: Get video hash from ssstik.io
async function getVideoHash(tiktokUrl) {
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

    // Extract hash from the "Tanpa tanda air" (Without watermark) download link
    const downloadLink = $('a.without_watermark').attr('href');

    if (!downloadLink) {
      throw new Error('Could not find download link in response');
    }

    // Extract hash from the URL
    const hashMatch = downloadLink.match(/\/ssstik\/([^?]+)/);
    if (!hashMatch) {
      throw new Error('Could not extract hash from download link');
    }

    return hashMatch[1];
  } catch (error) {
    console.error('Error getting video hash:', error.message);
    throw error;
  }
}

// Step 2: Get video download URL from tikcdn.io
async function getVideoDownloadUrl(hash) {
  try {
    const downloadUrl = `https://tikcdn.io/ssstik/${hash}`;

    // Make a HEAD request to get the final URL after redirects
    const response = await axios.head(downloadUrl, {
      maxRedirects: 5,
      headers: {
        'Referer': 'https://ssstik.io/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"'
      }
    });

    return response.request.res.responseUrl || downloadUrl;
  } catch (error) {
    console.error('Error getting video download URL:', error.message);
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

    // Step 1: Get video hash
    const hash = await getVideoHash(url);
    console.log('Extracted hash:', hash);

    // Step 2: Get download URL
    const downloadUrl = await getVideoDownloadUrl(hash);
    console.log('Download URL:', downloadUrl);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      hash: hash
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
