# DepositGuard AI

Secure FDR and security deposit workflow portal starter for Smart India Hackathon 2026, AICTE PS 26265.

This repository contains the initial application foundation, not a complete portal. Bank checks are not implemented as real verification; any future demo adapter must label its results as simulated.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- MongoDB Atlas URI (or a compatible MongoDB instance) for the API

## Local setup

1. Copy `server/.env.development.example` to `server/.env.development` and set `MONGODB_URI`.
2. Install dependencies from this directory with `npm install`.
3. Start both applications with `npm run dev`.
4. Open <http://localhost:5173>. The client calls the API through Vite's `/api` proxy.
5. Check API readiness at <http://localhost:4000/api/health>.

The backend validates environment variables at startup and only reports ready when MongoDB is connected. Do not commit `.env` files. Production values belong in the hosting provider's secret manager.

The server uses Tesseract.js with a locally installed English language model for PNG/JPEG and scanned-PDF OCR. PDF pages are rasterized in-process; OCR processes at most the first 10 pages per upload. Text-based PDFs use direct text extraction without rasterization. The English model is an npm dependency and is loaded locally, without runtime model downloads.

## Scripts

- `npm run dev` — client and server development processes
- `npm run build` — type-check and build both applications
- `npm run lint` — ESLint for both applications
- `npm run format:check` — Prettier check
- `npm run seed:demo --workspace @depositguard/server` — seed the local synthetic walkthrough dataset (set `DEMO_PASSWORD` first; production is refused)

See [docs/demo-walkthrough.md](docs/demo-walkthrough.md) for the login roles, deterministic PDF fixtures, scenario data, and presentation order.

## Structure

See `docs/architecture.md`, `docs/api.md`, `docs/permissions.md`, and `docs/threat-model.md` for the reviewed design baseline and unresolved policy assumptions.
