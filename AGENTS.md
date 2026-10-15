# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React and TypeScript frontend: UI components in `components/`, queue polling in `hooks/`, shared types in `types/`, and styles in `index.css`. `server/` contains the Express API (`app.ts`, `routes/`), BullMQ worker (`worker.ts`), and queue/download services (`services/`). Static icons, the web manifest, and crawler files live in `public/`. See `docs/TECHNICAL.md` for the API and download pipeline. Build output goes to `dist/`; do not edit it by hand.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from the lockfile.
- `npm run dev`, `npm run dev:server`, `npm run dev:worker`: start the frontend, API, and worker in separate terminals. Run Redis first and copy `.env.example` to `.env` for local settings.
- `npm run build`: type-check and build the frontend.
- `npm run build:server`: compile the API and worker.
- `npm run preview`: serve the built frontend locally.
- `docker-compose up --build`: start the complete stack with Redis and nginx.

## Coding Style & Naming Conventions

Use TypeScript and two-space indentation. Follow the style of the file you edit: frontend files omit semicolons; server files use them. Name React components in PascalCase (`QueueDisplay.tsx`), hooks with `use` (`usePollJob.ts`), and server modules by their responsibility (`downloadQueue.ts`). Keep API route handlers in `server/routes/` and reusable logic in `server/services/`. Use the `@/` alias for frontend imports and `.js` extensions for relative server imports, as existing files do. No formatter or linter command is configured; keep changes consistent with nearby code.

## Testing Guidelines

There is currently no automated test suite, test framework, or coverage target. Before opening a PR, run `npm run build` and `npm run build:server`. For queue or download changes, also exercise the affected flow locally with Redis, API, worker, and frontend running. If adding tests, place them near the code under test and use `*.test.ts` or `*.test.tsx`; document the new test command in `package.json`.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit style with a scope, such as `feat(queue): add persistence` and `fix(proxy): improve security`. Use a short imperative subject. In PRs, describe the behavior change, list verification commands and manual checks, link related issues when applicable, and include screenshots for visible UI changes.

## Configuration & Security

Keep secrets and local settings in `.env`, which is gitignored; update `.env.example` when introducing a variable. Preserve URL validation, rate limits, allowed origins, and proxy size limits when changing download routes.
