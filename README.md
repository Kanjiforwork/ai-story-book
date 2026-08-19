# Gradion Book Illustration Studio

Gradion Book Illustration Studio is a local, five-step book-to-illustration workflow:

`STYLE → CHARACTERS → PORTRAITS → CHAPTERS → ILLUSTRATIONS`

The application keeps generated text, progress, and private image assets on the server side so a refresh or local server restart can resume from persisted state.

## Prerequisites

- Node.js 20 or newer
- npm
- A local filesystem writable by the process
- A Gemini API key only when running real Gemini generation; automated tests use mocks

## Environment

Copy `.env.example` to `.env.local` and set values as needed:

| Variable               | Purpose                                     | Safe local default     |
| ---------------------- | ------------------------------------------- | ---------------------- |
| `GEMINI_API_KEY`       | Server-only Gemini credential               | empty for mocked tests |
| `GEMINI_TEXT_MODEL`    | Text-generation model override              | application default    |
| `GEMINI_IMAGE_MODEL`   | Image-generation model override             | application default    |
| `GRADION_DATA_DIR`     | SQLite database and private asset directory | `./data`               |
| `GRADION_STALE_RUN_MS` | Age after which a heartbeat is stale        | `120000`               |

Never commit `.env.local`, API keys, or generated private assets.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production-shaped local run:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

The health endpoint is `GET /api/health`.

## Commands

```bash
npm test
npm run check
npm run build
```

`npm run check` runs formatting, linting, TypeScript, environment validation, and the five-step pipeline contract check.

## Architecture

- Next.js App Router provides pages and server routes.
- React components render the project workspace and poll the server for the latest persisted view while a step runs.
- SQLite stores users, projects, ordered step state, run claims, item progress, and Gemini interaction metadata.
- The local filesystem stores book text and generated image bytes. Assets are served through an ownership-checked API route rather than exposing filesystem paths.
- Gemini access is server-only and is isolated behind adapters so tests can use deterministic mocks.
- Each step requires an explicit user action and an atomic server-side run claim. The persisted run ID and heartbeat prevent duplicate work and allow stale-run recovery.

## Persistence and recovery

Completed results are written as soon as they are available. Portrait and illustration items therefore retain successful assets when a later item fails. A failed step can be retried explicitly; a stale running step can be recovered explicitly and then started as a new run. Upstream style, character, portrait, and chapter results remain persisted during downstream retries.

The server enforces the assessment limits of at most two adult characters and one chapter, checks project ownership on project and asset operations, and rejects unsafe asset paths or missing backing files.

## Testing and limitations

The suite covers domain transitions, server routes/services, mocked Gemini output, duplicate claims, stale recovery, malformed output, partial image success, ownership, path safety, restart persistence, and representative frontend states. See [TESTING.md](TESTING.md) for the actual verification report.

Real Gemini calls are intentionally not part of the automated or M5 verification run because they incur cost. The runner is a local in-process worker, not a distributed queue or multi-process job system. Polling is used instead of SSE/WebSockets, and local SQLite/filesystem storage is not a production deployment architecture.
