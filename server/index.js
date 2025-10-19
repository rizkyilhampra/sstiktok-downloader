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

// Helper function to calculate exponential backoff delay
function calculateBackoffDelay(attempt, baseDelay = 1000, maxDelay = 60000) {
  if (attempt === 1) return 0; // First attempt is immediate
  // Exponential: 2^(attempt-2) * baseDelay
  // Attempt 2: 2^0 * 1000 = 1000ms
  // Attempt 3: 2^1 * 1000 = 2000ms
  // Attempt 4: 2^2 * 1000 = 4000ms, etc.
  const delay = baseDelay * Math.pow(2, attempt - 2);
  return Math.min(delay, maxDelay);
}

// Helper function for retry mechanism with exponential backoff
async function retryWithBackoff(operation, maxAttempts = 10, onAttempt = null) {
  let lastError;
  const baseDelay = 1000; // 1 second base delay
  const maxDelay = 60000; // 60 second max delay cap

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Calculate and apply delay before attempt (skip for first attempt)
      if (attempt > 1) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(`Retry attempt ${attempt}/${maxAttempts} - waiting ${delaySeconds}s (${delay}ms)...`);
        if (onAttempt) {
          onAttempt(attempt, maxAttempts);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log(`Starting download attempt 1/${maxAttempts}...`);
        if (onAttempt) {
          onAttempt(1, maxAttempts);
        }
      }

      // Execute the operation
      const result = await operation();
      if (attempt > 1) {
        console.log(`✓ Success on attempt ${attempt}/${maxAttempts}`);
      }
      return { result, attempt, retried: attempt > 1 };
    } catch (error) {
      lastError = error;
      console.error(`✗ Attempt ${attempt}/${maxAttempts} failed:`, error.message);

      // If this was the last attempt, throw
      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}

// Helper function to sanitize and create filename
function createFilename(author, description) {
  // Sanitize function: remove special chars, convert to lowercase, replace spaces with hyphens
  const sanitize = (str) => {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .trim();
  };

  // Sanitize author and description
  const sanitizedAuthor = sanitize(author || 'unknown');
  let sanitizedDesc = sanitize(description || 'video');

  // Truncate description to max 50 characters
  if (sanitizedDesc.length > 50) {
    sanitizedDesc = sanitizedDesc.substring(0, 50);
  }

  // Create timestamp: 2025-01-16-143022
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .substring(0, 17)
    .replace(/:/g, '');

  // Combine: author-timestamp.mp4
  return `${sanitizedAuthor}-${timestamp}.mp4`;
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

    // Extract author and description for filename
    const author = $('.result_overlay h2').text().trim() || 'unknown';
    const description = $('.result_overlay p.maintext').text().trim() || 'video';

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
        ttValue,
        author,
        description
      };
    }

    return {
      type: 'hd',
      directUrl: dataDirectUrl,
      ttValue,
      author,
      description
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

// Helper function to map errors to user-friendly messages
function getErrorResponse(error) {
  const message = error.message || '';
  const errorType = error.code || 'UNKNOWN_ERROR';

  // Network/connection errors
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('timeout')) {
    return {
      errorType: 'NETWORK_ERROR',
      message: 'Network connection failed',
      suggestion: 'Check your internet connection and try again.'
    };
  }

  // Rate limiting
  if (message.includes('429') || message.includes('Too Many Requests')) {
    return {
      errorType: 'RATE_LIMIT_ERROR',
      message: 'Too many requests',
      suggestion: 'Wait 30 seconds and try again or use a different video.'
    };
  }

  // Video not found or private
  if (message.includes('Could not find') || message.includes('download link') || message.includes('No HD download')) {
    return {
      errorType: 'VIDEO_NOT_FOUND',
      message: 'Could not process this video',
      suggestion: 'The video may be private, deleted, or has restrictions. Try a different video.'
    };
  }

  // Parse/extraction errors
  if (message.includes('extract') || message.includes('parse') || message.includes('hx-redirect')) {
    return {
      errorType: 'PARSE_ERROR',
      message: 'Unable to extract video data',
      suggestion: 'This may be a temporary issue. Try again in a moment.'
    };
  }

  // Default error
  return {
    errorType: 'UNKNOWN_ERROR',
    message: 'Failed to process video',
    suggestion: 'Please try again. If the problem persists, try a different video.'
  };
}

// API endpoint to download TikTok video
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'TikTok URL is required',
        errorType: 'INVALID_INPUT'
      });
    }

    // Validate TikTok URL
    if (!url.includes('tiktok.com')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TikTok URL',
        errorType: 'INVALID_URL',
        suggestion: 'Please enter a valid TikTok URL (e.g., https://www.tiktok.com/@user/video/123...)'
      });
    }

    console.log('Processing TikTok URL:', url);

    // Wrap entire download pipeline with retry logic
    const { result, attempt, retried } = await retryWithBackoff(async () => {
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
        throw new Error('No HD download available');

        // Standard quality: direct to final URL
        // downloadUrl = await getFinalDownloadUrl(downloadData.downloadLink, 'standard');
      }

      console.log('Final download URL obtained');

      // Generate filename from author and description
      const filename = createFilename(downloadData.author, downloadData.description);
      console.log('Generated filename:', filename);

      return {
        downloadUrl,
        quality: downloadData.type,
        filename,
        author: downloadData.author,
        description: downloadData.description
      };
    });

    res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      quality: result.quality,
      filename: result.filename,
      author: result.author,
      description: result.description,
      retryAttempt: attempt,
      isRetrying: retried
    });

  } catch (error) {
    console.error('Error:', error.message);
    const errorInfo = getErrorResponse(error);

    res.status(500).json({
      success: false,
      error: errorInfo.message,
      errorType: errorInfo.errorType,
      suggestion: errorInfo.suggestion,
      details: 'All 10 retry attempts failed. Please try again later.',
      retryAttempt: 10,
      isRetrying: true
    });
  }
});

// Proxy download endpoint
app.get('/api/proxy-download', async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Download URL is required' });
    }

    const finalFilename = filename || 'tiktok-video.mp4';
    console.log('Proxying download from:', url);
    console.log('Using filename:', finalFilename);

    // Fetch the video from the external URL
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'Referer': 'https://ssstik.io/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    });

    // Set headers to force download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);

    // Copy content-length if available
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Pipe the video stream to the response
    response.data.pipe(res);
  } catch (error) {
    console.error('Error proxying download:', error.message);
    res.status(500).json({
      error: 'Failed to download video',
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
