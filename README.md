# sstiktok-downloader

## 📘 Overview

This is a **server-side scraper wrapper** around [ssstik.io](https://ssstik.io) that retrieves **HD TikTok download links** — without ads, watermarks, or requiring user interaction.
The backend resolves the final MP4 URL and proxies it directly to the browser with a sanitized filename.

> [!WARNING]
> **Legal & Ethical Notice:** This project is for **educational and research use only**. It wraps ssstik.io to extract video metadata and proxies MP4 streams. Users must follow TikTok's and ssstik.io's ToS, only download content they own or have permission for, and ensure local compliance. The authors assume no liability for misuse.

## ✨ Features

* 🎥 **HD/FullHD downloads** – No watermark
* 🚫 **No ad gate** – Direct API calls (no ssstik.io UI)
* ⚡ **One-click download** – Paste & go
* 📋 **Clipboard integration**
* 🧩 **Smart filenames** – `username-timestamp.mp4` (extracts @username from TikTok URL when author name is emojis)
* 🧭 **Responsive UI** – Mobile + desktop
* 💡 **Helpful errors** – Clear, categorized error messages with suggestions
* 🐳 **Docker ready** – Simple deployment
* ❤️ **Health checks** – `/api/health` endpoint + Docker healthcheck
* 📥 **Download queue system** – Add multiple URLs, processed concurrently
* 🎬 **Video metadata display** – Shows author and video description
* 🔄 **Retry mechanism** – Exponential backoff with up to 5 retry attempts
* 👁️ **Retry visibility** – Attempt progress with wait times via polling
* ⏱️ **Request timeout** – 2-minute client-side poll ceiling for hung jobs
* 📡 **Range request support** – Proxy streams range headers for resume/seek support
* ✅ **URL validation** – Client-side format validation with real-time feedback

## 🧠 How It Works

```mermaid
graph LR
    A["🌐 Client"] -->|TikTok URL| B["⚡ Express API"]
    B -->|Store status + enqueue| C["📦 Redis + BullMQ"]
    C -->|Job work| D["⚙️ Worker"]
    D -->|Fetch metadata| E["🔗 ssstik.io"]
    E -->|Video data| D
    D -->|Save final URL| C
    A -->|Poll status| B
    B -->|Proxy MP4| F["🎬 TikTok CDN"]
    F -->|MP4 stream| A

    style A fill:#3b82f6,stroke:#1e40af,color:#fff
    style B fill:#10b981,stroke:#047857,color:#fff
    style C fill:#dc2626,stroke:#991b1b,color:#fff
    style D fill:#8b5cf6,stroke:#6d28d9,color:#fff
    style E fill:#f59e0b,stroke:#d97706,color:#fff
    style F fill:#0ea5e9,stroke:#0369a1,color:#fff
```

1. **Enqueue job** in Redis/BullMQ and return a `jobId`
2. **Worker fetches metadata** from ssstik.io
3. **Extract hx-redirect URL** containing base64-encoded video URL
4. **Decode and resolve final URL** with proper headers and redirects
5. **Save result in Redis** and proxy MP4 stream to the browser when complete

> Because requests are handled server-side, users never see ssstik.io's ads.

## 🖥️ Tech Stack

### Frontend

* React 19 + TypeScript 5.6
* Vite 6 (dev server & build tool)
* Tailwind 4 + Radix UI + Lucide React
* Axios (HTTP client)

### Backend

* Node.js 20+ + Express 4.18
* Cheerio (HTML parsing)
* Axios + CORS
* Redis + BullMQ (shared job state and background workers)

### DevOps

* Docker + Docker Compose
* Alpine Linux base image

## 🚀 Installation

### Local development

```bash
git clone https://github.com/rizkyilhampra/sstiktok-downloader.git
cd sstiktok-downloader
npm install
```

Create `.env`:

```env
PORT=3000
REDIS_URL=redis://localhost:6379
MAX_CLIENT_CONCURRENT_DOWNLOADS=3
WORKER_CONCURRENCY=1
JOB_TTL_SECONDS=600
```

Start Redis, then run the app services:

```bash
# Terminal 1 – Redis
docker run --rm -p 6379:6379 redis:7-alpine

# Terminal 2 – backend API
npm run dev:server

# Terminal 3 – worker
npm run dev:worker

# Terminal 4 – frontend
npm run dev
```

**URLs:**

* Frontend: [http://localhost:5173](http://localhost:5173)
* Backend: [http://localhost:3000](http://localhost:3000)

Vite proxies `/api/*` to the backend.

### Docker

```bash
docker-compose up --build --scale app=2 --scale worker=3
```

App available at [http://localhost](http://localhost)

The example above runs Redis, 2 app replicas, and 3 worker replicas. Tune these for the server:

* 1 core: `app=1`, `worker=1`, `MAX_CLIENT_CONCURRENT_DOWNLOADS=1`, `WORKER_CONCURRENCY=1`
* 2 cores: `app=1`, `worker=1-2`, `MAX_CLIENT_CONCURRENT_DOWNLOADS=2`, `WORKER_CONCURRENCY=1`
* 4+ cores: `app=2-3`, workers on remaining cores, `MAX_CLIENT_CONCURRENT_DOWNLOADS` near worker capacity

### Local production

```bash
npm run build
npm run build:server
npm run server

# In another terminal
npm run worker
```

Builds the frontend/server, serves app + API on port 3000, and runs the background worker.

## 🧩 Usage

### Basic Download

1. Open the app in your browser
2. Paste a TikTok URL into the input field
3. The URL is automatically added to the queue
4. Up to 3 videos are processed concurrently
5. The backend proxies the HD stream to your browser

### Queue Management

* **Add to queue** – URLs auto-added after 1.5 seconds of input (with validation)
* **Clipboard paste** – Use the clipboard button for instant queue addition
* **Retry failed** – Click retry button on failed items to reprocess
* **Remove items** – Delete videos from queue with confirmation
* **Clear completed** – Bulk remove all successfully downloaded items
* **Auto-hide** – Completed items disappear automatically after 10 seconds; URL input is cleared

### Features

* **Metadata display** – Each queue item shows video author and description
* **Error suggestions** – Failed downloads show actionable error messages
* **Retry attempts** – Automatic retries (up to 5) with exponential backoff
* **Request timeout** – 2-minute poll ceiling prevents hung jobs
* **Real-time validation** – URL format checked before queue addition

**Supported URL formats:**

Any URL containing `tiktok.com` is accepted. Common formats:

```
https://www.tiktok.com/@username/video/123456789
https://vm.tiktok.com/XXXXXXXXXX
https://vt.tiktok.com/XXXXXXXXXX
```

## 🧰 API Endpoints

| Endpoint              | Method | Description                                            |
| --------------------- | ------ | ------------------------------------------------------ |
| `/api/download`       | `POST`      | Enqueue a TikTok URL; returns `{ jobId, maxAttempts }` immediately |
| `/api/jobs/:jobId`    | `GET`       | Poll job status (`queued` / `processing` / `completed` / `failed`) |
| `/api/proxy-download` | `GET`       | Stream video file to client; supports range requests               |
| `/api/health`         | `GET`       | Health check — returns `{ status: "ok" }`                          |
| `/api/config`         | `GET`       | Client runtime config, including queue concurrency                 |

### Download Flow Details

`POST /api/download` returns a `jobId` immediately. The API stores job state in Redis and enqueues work in BullMQ. Worker processes run the pipeline in the background:

1. **Scrape ssstik.io** – Fetch video metadata and HD download data; throws if HD is unavailable
2. **Get hx-redirect URL** – Extract base64-encoded URL from response headers
3. **Decode base64** – Extract actual TikTok CDN URL (e.g., `https://v16.tokcdn.com/...`)
4. **Resolve final URL** – Follow redirects to get playable video URL
5. **Generate filename** – Uses author name, or extracts `@username` from TikTok URL if author name contains only emojis

Poll `GET /api/jobs/:jobId` for status. On `completed`, the client fetches `/api/proxy-download?jobId=…` to stream the file.


## 🧱 Project Structure

```
sstiktok-downloader/
├── public/                # Static assets
├── src/                   # React + TS source
│   ├── components/
│   │   ├── QueueDisplay.tsx
│   │   └── ui/
│   ├── hooks/
│   │   └── usePollJob.ts
│   ├── types/
│   │   ├── api.ts
│   │   └── queue.ts
│   ├── lib/
│   │   └── utils.ts
│   ├── App.tsx
│   └── main.tsx
├── server/                # Express backend + BullMQ worker
│   ├── index.ts
│   └── worker.ts
├── dist/                  # Production build
├── components.json        # shadcn/ui config
├── Dockerfile
├── docker-compose.yml
├── vite.config.ts
├── package.json
└── .env
```

## 📄 License

Released under the **MIT License**.
See [LICENSE](LICENSE) for details.
