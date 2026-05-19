# sstiktok-downloader

## 📘 Overview

A TikTok video downloader. Paste one or many links and get clean **HD / Full HD** files back, with no watermarks and no ad gates. Links are queued and downloaded several at a time instead of one by one, and the app retries automatically if something fails.

> [!WARNING]
> **Legal & Ethical Notice:** This project is for **educational and research use only**. It wraps [ssstik.io](https://ssstik.io) to extract video metadata and proxies MP4 streams. Users must follow TikTok's and [ssstik.io's](https://ssstik.io) ToS, only download content they own or have permission for, and ensure local compliance. The authors assume no liability for misuse.

## Features

* **HD / Full-HD video, no watermark**
* **No ad gate, no waiting room**
* **Batch downloads, not one-at-a-time**
* **One-tap clipboard paste**
* **Automatic retry**
* **Sensible filenames** — saved as `username-timestamp.mp4`

## Tech stack

* React 19
* TypeScript 5.6
* Vite 6
* Tailwind 4
* Node.js 20
* Express 4
* BullMQ
* Redis
* Cheerio
* Docker
* nginx

## Usage

1. Open the app.
2. Tap **Paste from Clipboard** (or type a TikTok link into the input).
3. That's it — the video is queued and downloads automatically when it's ready.

Paste as many links as you want. The app downloads several at once and saves each file to your device the moment it's ready. Completed items clear themselves after a few seconds so the screen stays tidy. If a download fails, it shows you why and retries on its own.

Any URL containing `tiktok.com` works, including the short `vm.tiktok.com` and `vt.tiktok.com` share links.

## Installation

### Local development

```bash
git clone https://github.com/rizkyilhampra/sstiktok-downloader.git
cd sstiktok-downloader
npm install
```

Create a `.env` file:

```env
PORT=3000
REDIS_URL=redis://localhost:6379
MAX_CLIENT_CONCURRENT_DOWNLOADS=3
WORKER_CONCURRENCY=1
JOB_TTL_SECONDS=600
```

Make sure a Redis instance is running and reachable at `REDIS_URL`. Then start the three app processes:

```bash
# Terminal 1 – backend API
npm run dev:server

# Terminal 2 – worker
npm run dev:worker

# Terminal 3 – frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend proxies API calls to the backend on port 3000.

### Docker

Everything (Redis, nginx, the API, and workers) comes up with one command:

```bash
docker-compose up --build
```

The app is then available at [http://localhost](http://localhost).

By default this runs 2 app replicas and 3 worker replicas behind nginx. For replica and concurrency tuning per server size, see [docs/TECHNICAL.md](docs/TECHNICAL.md#scaling).

## Documentation

API reference, the download pipeline, and architecture details live in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## License

Released under the **MIT License**. See [LICENSE](LICENSE) for details.
