# sstiktok-downloader

## 📘 Overview

`sstiktok-downloader` is a **server-side scraper wrapper** around [ssstik.io](https://ssstik.io) that retrieves **HD TikTok download links** — without ads, watermarks, or requiring user interaction.
The backend resolves the final MP4 URL and proxies it directly to the browser with a sanitized filename.

> ⚠️ **Disclaimer:** This project is for **educational and research use only**.
> It does not host or modify TikTok content. Users assume full responsibility for compliance with all relevant laws and terms.

## ⚖️ Legal & Ethical Notice

### 📜 Scraping Notice

This project **programmatically wraps ssstik.io** to automate HD link extraction. It:

* Parses ssstik.io’s HTML responses
* Extracts video metadata (author, caption, URLs)
* Proxies final CDN streams via server

### ⚖️ Responsible Use

* Follow TikTok’s and ssstik.io’s Terms of Service
* Only download content you **own** or have **explicit permission** to use
* Do **not** use this tool to bypass DRM or creator protections
* Ensure compliance with **local, state, and international laws**

> The authors assume **no liability** for misuse or violation of third-party rights.

## ✨ Features

* 🎥 **HD/FullHD downloads** – No watermark
* 🚫 **No ad gate** – Direct API calls (no ssstik.io UI)
* ⚡ **One-click download** – Paste & go
* 📋 **Clipboard integration**
* 🧩 **Smart filenames** – `author-timestamp.mp4`
* 🧭 **Responsive UI** – Mobile + desktop
* 💡 **Helpful errors** – Clear messages
* 🐳 **Docker ready** – Simple deployment
* ❤️ **Health checks** – `/api/health` endpoint + Docker healthcheck

## 🧠 How It Works

```
Client → Express API → ssstik.io → CDN → Client (MP4 stream)
```

1. Fetch TikTok video metadata from ssstik.io
2. Extract the HD redirect handle
3. Resolve the final CDN URL
4. Proxy the MP4 stream to the browser

> Because requests are handled server-side, users never see ssstik.io’s ads.

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

### DevOps

* Docker + Docker Compose
* Alpine Linux base image

## 🚀 Installation

### **Option 1: Local development**

```bash
git clone https://github.com/rizkyilhampra/sstiktok-downloader.git
cd sstiktok-downloader
npm install
```

Create `.env`:

```env
PORT=3000
```

Run both servers:

```bash
# Terminal 1 – backend
npm run server

# Terminal 2 – frontend
npm run dev
```

**URLs:**

* Frontend → [http://localhost:5173](http://localhost:5173)
* Backend → [http://localhost:3000](http://localhost:3000)

Vite proxies `/api/*` to the backend.

### **Option 2: Docker**

```bash
docker-compose up --build
```

→ App available at [http://localhost:3000](http://localhost:3000)

### **Option 3: Local production**

```bash
npm run start
```

Builds the frontend and serves app + API on port 3000.

## 🧩 Usage

1. Open the app in your browser
2. Paste a TikTok URL
3. Click **Download**
4. The backend proxies the HD stream to your browser

**Supported URL formats:**

```
https://www.tiktok.com/@username/video/123456789
https://vm.tiktok.com/XXXXXXXXXX
https://vt.tiktok.com/XXXXXXXXXX
```

## 🧰 API Endpoints

| Endpoint              | Method | Description                                            |
| --------------------- | ------ | ------------------------------------------------------ |
| `/api/download`       | `POST` | Process TikTok URL and return final HD link + filename |
| `/api/proxy-download` | `GET`  | Stream video file to client                            |
| `/api/health`         | `GET`  | Health check endpoint                                  |

### Example:

```bash
curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@username/video/123456789"}'
```

Response:

```json
{
  "success": true,
  "downloadUrl": "https://…",
  "quality": "hd",
  "filename": "john-doe-2025-10-16-143022.mp4"
}
```

Proxy download:

```bash
curl -L "http://localhost:3000/api/proxy-download?url=<encoded-url>&filename=john-doe-2025-10-16-143022.mp4" -o video.mp4
```

## 🧱 Project Structure

```
sstiktok-downloader/
├── public/                # Static assets
├── src/                   # React + TS source
│   ├── components/
│   ├── App.tsx
│   └── main.tsx
├── server/                # Express backend
│   └── index.js
├── dist/                  # Production build
├── Dockerfile
├── docker-compose.yml
├── vite.config.ts
├── package.json
└── .env
```

## ⚙️ Available Scripts

| Script            | Description                   |
| ----------------- | ----------------------------- |
| `npm run dev`     | Start frontend (Vite)         |
| `npm run server`  | Start backend (Express)       |
| `npm run build`   | Build for production          |
| `npm run preview` | Preview production build      |
| `npm run start`   | Serve app + API in production |


## 📄 License

Released under the **MIT License**.
See [LICENSE](LICENSE) for details.
