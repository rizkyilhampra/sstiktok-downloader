# TikTok Video Downloader

A web application to download TikTok videos without watermark using ssstik.io automation.

## Features

- Clean and modern web interface
- Download TikTok videos without watermark
- No registration or API key required
- Direct video download links
- Works with any public TikTok video

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Paste a TikTok video URL and click "Get Download Link"

4. Click "Download Video" to save the video to your device

## API Endpoint

You can also use the API directly:

### POST `/api/download`

Request body:
```json
{
  "url": "https://www.tiktok.com/@username/video/1234567890"
}
```

Response:
```json
{
  "success": true,
  "downloadUrl": "https://tikcdn.io/ssstik/...",
  "hash": "..."
}
```

### Example with curl:

```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@username/video/1234567890"}'
```

## How It Works

1. **Step 1**: Send TikTok URL to ssstik.io to get video hash
   - POST request to `https://ssstik.io/abc?url=dl`
   - Parse HTML response to extract download link hash

2. **Step 2**: Use the hash to get the direct download URL
   - GET request to `https://tikcdn.io/ssstik/{hash}`
   - Follow redirects to get final video URL

## Project Structure

```
sstiktok-downloader/
├── server.js           # Express server with API endpoints
├── public/
│   └── index.html     # Frontend web interface
├── package.json       # Project dependencies
└── README.md          # Documentation
```

## Technologies Used

- **Backend**: Node.js, Express
- **HTTP Client**: Axios
- **HTML Parser**: Cheerio
- **Frontend**: Vanilla HTML, CSS, JavaScript

## Environment

- Default port: 3000 (configurable via PORT environment variable)

## Notes

- This tool is for educational purposes only
- Respect content creators' rights and TikTok's terms of service
- Video availability depends on ssstik.io service status
- Some videos may not be downloadable due to privacy settings

## Troubleshooting

If you encounter issues:

1. **Server won't start**: Check if port 3000 is already in use
2. **Cannot download video**: Verify the TikTok URL is valid and public
3. **Hash extraction fails**: ssstik.io may have updated their HTML structure

## License

MIT
