# TikTok Video Downloader

A modern, full-stack web application to download TikTok videos without watermark. Built with React 19, TypeScript, Vite, Tailwind CSS 4, and shadcn/ui.

## Features

- **Modern UI**: Beautiful gradient design with shadcn/ui components
- **Fast**: Lightning-fast development with Vite and HMR
- **Type-Safe**: Full TypeScript implementation
- **Responsive**: Works seamlessly on all devices
- **No Watermark**: Download TikTok videos without watermark
- **Free**: No registration or API key required
- **Direct Download**: Get direct video download links instantly

## Tech Stack

### Frontend
- **React 19** - Latest React with new features (Actions API)
- **TypeScript** - Full type safety
- **Vite 6** - Next-generation build tool
- **Tailwind CSS 4** - Modern utility-first CSS with Vite plugin
- **shadcn/ui** - Beautiful, accessible UI components
- **Lucide React** - Modern icon library

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **Axios** - HTTP client
- **Cheerio** - HTML parser for scraping

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sstiktok-downloader
```

2. Install dependencies:
```bash
npm install
```

## Development

### Run Development Mode

You'll need two terminal windows:

**Terminal 1 - Frontend (Vite dev server):**
```bash
npm run dev
```
This starts the Vite dev server at http://localhost:5173

**Terminal 2 - Backend (Express API):**
```bash
npm run server
```
This starts the Express server at http://localhost:3000

The Vite dev server will proxy API requests to the Express backend automatically.

### Available Scripts

- `npm run dev` - Start Vite development server (frontend)
- `npm run server` - Start Express API server (backend)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm start` - Build and start production server

## Production

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
NODE_ENV=production npm run server
```

The server will serve the built React app and API from port 3000.

## Project Structure

```
sstiktok-downloader/
├── src/                      # Frontend source
│   ├── components/
│   │   └── ui/              # shadcn/ui components
│   ├── lib/                 # Utilities
│   ├── types/               # TypeScript types
│   ├── App.tsx              # Main React component
│   ├── main.tsx             # React entry point
│   └── index.css            # Tailwind CSS imports
├── server/                   # Backend source
│   └── index.js             # Express server
├── public/                   # Static assets
├── dist/                     # Production build (generated)
├── index.html               # HTML template
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
├── components.json          # shadcn/ui configuration
└── package.json             # Dependencies
```

## API Endpoint

### POST `/api/download`

Download a TikTok video without watermark.

**Request:**
```json
{
  "url": "https://www.tiktok.com/@username/video/1234567890"
}
```

**Response (Success):**
```json
{
  "success": true,
  "downloadUrl": "https://tikcdn.io/ssstik/...",
  "hash": "abc123..."
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Failed to process TikTok video",
  "message": "Error details..."
}
```

### Example with curl:

```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@username/video/1234567890"}'
```

## How It Works

1. **Step 1**: User submits TikTok URL through React frontend
2. **Step 2**: Frontend sends POST request to `/api/download`
3. **Step 3**: Backend sends TikTok URL to ssstik.io
4. **Step 4**: Parse HTML response to extract download hash
5. **Step 5**: Use hash to get final download URL from tikcdn.io
6. **Step 6**: Return download URL to frontend
7. **Step 7**: User clicks download button to save video

## Configuration

### Vite Configuration (`vite.config.ts`)

- React plugin for Fast Refresh
- Tailwind CSS 4 Vite plugin
- Path aliases (`@/` → `./src/`)
- Proxy configuration for API requests in development

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Notes

- This tool is for educational purposes only
- Respect content creators' rights and TikTok's terms of service
- Video availability depends on ssstik.io service status
- Some videos may not be downloadable due to privacy settings

## Troubleshooting

### Development Issues

1. **Port already in use**:
   - Change port in `vite.config.ts` (frontend) or use `PORT=3001 npm run server` (backend)

2. **API requests failing**:
   - Make sure Express server is running on port 3000
   - Check Vite proxy configuration in `vite.config.ts`

3. **TypeScript errors**:
   - Run `npm install` to ensure all type definitions are installed
   - Check `tsconfig.json` for proper configuration

4. **Tailwind styles not working**:
   - Verify `@import "tailwindcss";` is in `src/index.css`
   - Check that `@tailwindcss/vite` plugin is in `vite.config.ts`

### Production Issues

1. **Server won't start**:
   - Run `npm run build` first
   - Check if port 3000 is available

2. **Cannot download video**:
   - Verify the TikTok URL is valid and public
   - Check if ssstik.io service is operational

3. **Hash extraction fails**:
   - ssstik.io may have updated their HTML structure
   - Check backend logs for detailed error messages

## License

MIT

## Credits

- Built with modern web technologies (October 2025)
- Powered by ssstik.io for video processing
- UI components from shadcn/ui
