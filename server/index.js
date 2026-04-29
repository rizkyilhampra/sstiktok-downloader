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

// Store active SSE connections
const sseConnections = new Map();

const jobs = new Map();
const JOB_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const STEP_TIMEOUT_MS = 15000;

function scheduleJobCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS).unref?.();
}


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
function calculateBackoffDelay(attempt, baseDelay = 2000, maxDelay = 30000) {
  if (attempt === 1) return 0;
  const delay = baseDelay * Math.pow(2, attempt - 2);
  return Math.min(delay, maxDelay);
}

// Helper function for retry mechanism with exponential backoff
async function retryWithBackoff(operation, maxAttempts = DEFAULT_MAX_ATTEMPTS, onAttempt = null) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = calculateBackoffDelay(attempt);
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

// Helper function to extract username from TikTok URL by fetching and parsing embedded JSON
async function extractUsernameFromUrl(url) {
  try {
    console.log('Fetching TikTok page to extract username from embedded data...');

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      maxRedirects: 5,
      timeout: STEP_TIMEOUT_MS,
    });

    const html = response.data;

    // Try to extract from __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
    const scriptMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (scriptMatch) {
      try {
        const jsonStr = scriptMatch[1];

        // Method 1: Extract from canonical URL in seo.abtest
        // Pattern: "canonical":"https:\u002F\u002Fwww.tiktok.com\u002F@username\u002Fvideo\u002F..."
        const canonicalMatch = jsonStr.match(/"canonical":"https:\\u002F\\u002Fwww\.tiktok\.com\\u002F@([^\\]+)\\u002Fvideo/);
        if (canonicalMatch) {
          const username = canonicalMatch[1];
          console.log('Extracted username from canonical URL:', username);
          return username;
        }

        // Method 2: Parse the full JSON and get uniqueId from author object
        const data = JSON.parse(jsonStr);
        const username = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.author?.uniqueId;
        if (username) {
          console.log('Extracted username from author.uniqueId:', username);
          return username;
        }
      } catch (e) {
        console.error('Failed to parse embedded JSON:', e.message);
      }
    }
  } catch (error) {
    console.error('Error extracting username from URL:', error.message);
  }

  return null;
}

// Helper function to sanitize and create filename
async function createFilename(author, tiktokUrl = null) {
  // Sanitize function: remove special chars, convert to lowercase, replace spaces with hyphens
  const sanitize = (str) => {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .trim();
  };

  // Sanitize author
  let sanitizedAuthor = sanitize(author || '');

  // If sanitized author is empty (e.g., author was only emojis), try to get username from TikTok URL
  if (!sanitizedAuthor && tiktokUrl) {
    console.log('Author name is empty (likely emojis), attempting to extract username from URL...');
    const username = await extractUsernameFromUrl(tiktokUrl);
    if (username) {
      sanitizedAuthor = sanitize(username);
    }
  }

  // Final fallback
  if (!sanitizedAuthor) {
    sanitizedAuthor = 'unknown';
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
      },
      timeout: STEP_TIMEOUT_MS,
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
      throw new Error('HD download not available for this video');
    }

    return {
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
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: STEP_TIMEOUT_MS,
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
async function getFinalDownloadUrl(urlOrHash) {
  try {
    // Decode the base64 encoded URL from hx-redirect
    // The URL format is: https://tikcdn.io/ssstik/[base64-encoded-video-url]
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
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"'
      }
    });

    return response.request.res.responseUrl || targetUrl;
  } catch (error) {
    console.error('Error getting final download URL:', error.message);
    console.error('Error details:', {
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data?.substring(0, 200)
    });
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
  if (message.includes('Could not find') || message.includes('download link') || message.includes('HD download not available')) {
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

// SSE endpoint for progress updates
app.get('/api/progress/:requestId', (req, res) => {
  const { requestId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`);

  // Store this connection
  sseConnections.set(requestId, res);

  // Clean up on client disconnect
  req.on('close', () => {
    sseConnections.delete(requestId);
    console.log(`SSE connection closed for request ${requestId}`);
  });

  console.log(`SSE connection established for request ${requestId}`);
});

// Helper function to send progress updates via SSE
function sendProgress(requestId, data) {
  const connection = sseConnections.get(requestId);
  if (connection) {
    connection.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

async function runDownloadJob(jobId, url) {
  const job = jobs.get(jobId);
  if (!job) return;

  sendProgress(jobId, {
    type: 'status',
    status: 'processing',
    attempt: 1,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  });

  try {
    const { result, attempt, retried } = await retryWithBackoff(
      async () => {
        const downloadData = await getHDDownloadData(url);

        const hxRedirectUrl = await getHxRedirectUrl(
          downloadData.directUrl,
          downloadData.ttValue
        );
        console.log('Got hx-redirect URL:', hxRedirectUrl);

        const downloadUrl = await getFinalDownloadUrl(hxRedirectUrl);
        console.log('Final download URL obtained');

        return {
          downloadUrl,
          quality: 'hd',
          author: downloadData.author,
          description: downloadData.description,
        };
      },
      DEFAULT_MAX_ATTEMPTS,
      (currentAttempt) => {
        job.attempt = currentAttempt;
        const delay = calculateBackoffDelay(currentAttempt);
        sendProgress(jobId, {
          type: 'retry',
          attempt: currentAttempt,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          delay,
          message:
            currentAttempt === 1
              ? 'Starting download...'
              : `Retry attempt ${currentAttempt}/${DEFAULT_MAX_ATTEMPTS} (waiting ${(delay / 1000).toFixed(1)}s)`,
        });
      }
    );

    const filename = await createFilename(result.author, url);
    console.log('Generated filename:', filename);

    Object.assign(job, {
      status: 'completed',
      attempt,
      retried,
      finishedAt: Date.now(),
      downloadUrl: result.downloadUrl,
      quality: result.quality,
      filename,
      author: result.author,
      description: result.description,
    });

    sendProgress(jobId, { type: 'success', attempt, retried });
  } catch (error) {
    console.error('Job error:', error.message);
    const errorInfo = getErrorResponse(error);
    Object.assign(job, {
      status: 'failed',
      finishedAt: Date.now(),
      error: errorInfo.message,
      errorType: errorInfo.errorType,
      suggestion: errorInfo.suggestion,
    });
    sendProgress(jobId, {
      type: 'error',
      error: errorInfo.message,
      errorType: errorInfo.errorType,
      suggestion: errorInfo.suggestion,
    });
  } finally {
    const connection = sseConnections.get(jobId);
    if (connection) {
      connection.end();
      sseConnections.delete(jobId);
    }
    scheduleJobCleanup(jobId);
  }
}

app.post('/api/download', (req, res) => {
  const { url, requestId } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'TikTok URL is required',
      errorType: 'INVALID_INPUT',
    });
  }

  if (!url.includes('tiktok.com')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid TikTok URL',
      errorType: 'INVALID_URL',
      suggestion:
        'Please enter a valid TikTok URL (e.g., https://www.tiktok.com/@user/video/123...)',
    });
  }

  const jobId =
    requestId ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (jobs.has(jobId)) {
    console.log('Idempotent reuse of existing job', jobId);
    return res.json({ jobId, maxAttempts: DEFAULT_MAX_ATTEMPTS });
  }

  jobs.set(jobId, {
    id: jobId,
    status: 'processing',
    attempt: 1,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    createdAt: Date.now(),
    finishedAt: null,
  });

  console.log('Starting job', jobId, 'for URL:', url);
  runDownloadJob(jobId, url).catch((err) => {
    console.error('Unhandled job error:', err);
  });

  res.json({ jobId, maxAttempts: DEFAULT_MAX_ATTEMPTS });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired' });
  }
  res.json(job);
});

// Proxy download endpoint — URL comes from the server-side job store to prevent SSRF; clients supply only a jobId.
app.get('/api/proxy-download', async (req, res) => {
  const { jobId, filename } = req.query;

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed' || !job.downloadUrl) {
    return res.status(400).json({ error: 'Job not found, not completed, or has no download URL' });
  }

  const url = job.downloadUrl;
  const finalFilename = filename || job.filename || 'tiktok-video.mp4';
  console.log('Proxying download from:', url);
  console.log('Using filename:', finalFilename);

  const upstreamHeaders = {
    Referer: 'https://ssstik.io/',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  if (req.headers.range) {
    upstreamHeaders.Range = req.headers.range;
  }

  let upstream;
  try {
    upstream = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: upstreamHeaders,
      validateStatus: (status) => status >= 200 && status < 400,
    });
  } catch (error) {
    console.error('Error proxying download:', error.message);
    return res.status(502).json({
      error: 'Failed to download video',
      message: error.message,
    });
  }

  const stream = upstream.data;

  // Mid-stream upstream errors and client-disconnect cleanup. Without these
  // a broken upstream silently truncates the file and a closed client socket
  // leaves the upstream draining in the background.
  const cleanup = () => {
    if (!stream.destroyed) stream.destroy();
  };
  stream.on('error', (err) => {
    console.error('upstream stream error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream stream error', message: err.message });
    } else {
      res.destroy(err);
    }
  });
  res.on('error', (err) => {
    console.error('response stream error:', err.message);
    cleanup();
  });
  req.on('close', cleanup);

  res.status(upstream.status);
  res.setHeader(
    'Content-Type',
    upstream.headers['content-type'] || 'video/mp4'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${finalFilename}"`
  );
  res.setHeader('Accept-Ranges', upstream.headers['accept-ranges'] || 'bytes');
  if (upstream.headers['content-length']) {
    res.setHeader('Content-Length', upstream.headers['content-length']);
  }
  if (upstream.headers['content-range']) {
    res.setHeader('Content-Range', upstream.headers['content-range']);
  }

  stream.pipe(res);
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
