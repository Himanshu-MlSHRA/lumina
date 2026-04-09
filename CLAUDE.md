# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lumina** is a full-stack AI-powered mental wellness platform featuring voice therapy sessions (via Gemini), mood tracking, mindful games, real-time community chat, and daily anti-doomscrolling tasks.

## Monorepo Structure

This is an npm workspaces monorepo with two packages:
- `client/` — React frontend (Vite + TypeScript)
- `server/` — Express backend (TypeScript + Prisma + Socket.io)

## Development Commands

### Client (port 3000)
```bash
cd client && npm run dev      # Start Vite dev server
cd client && npm run build    # Production build
```

### Server (port 3001)
```bash
cd server && npm run dev        # Start Express with tsx watch
cd server && npm run db:migrate # Run Prisma migrations
cd server && npm run db:seed    # Seed default groups
cd server && npm run db:studio  # Open Prisma Studio
```

No test runner or linter is configured.

## Environment Variables

### Client (`client/.env`)
- `VITE_GEMINI_API_KEY` — Used only for Gemini Live API voice sessions (fetched via `GET /api/ai/session-key` at runtime)

### Server (`server/.env`)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `GEMINI_API_KEY` — Google Gemini API key (proxied to client via authenticated endpoint)
- `PORT` — Server port (default 3001)

## Architecture

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS (npm build, not CDN), Zustand for state, Socket.io client, Recharts, FontAwesome
- **Backend**: Express 5 + TypeScript, Prisma ORM + PostgreSQL, Socket.io, JWT auth (bcrypt + jsonwebtoken)
- **AI**: Google Gemini API (`@google/genai`) proxied through the Express server

### Client Architecture (`client/src/`)
- `app/` — App entry point, router setup
- `pages/` — Route-level components (Dashboard, Chat, Games, Community, GroupChat, DirectMessage, Login, Signup)
- `components/layout/` — Layout with responsive sidebar (desktop) / bottom nav (mobile) via `<Outlet />`
- `components/auth/` — AuthGuard, LoginForm, SignupForm
- `components/games/` — Individual game components extracted from Games page
- `components/ui/` — Shared UI primitives (GlassCard, Button)
- `stores/` — Zustand stores (authStore, taskStore, moodStore, chatStore)
- `services/` — API client (`api.ts`), Socket.io client (`socketService.ts`), Gemini proxy (`geminiProxy.ts`)
- `hooks/` — Custom hooks (useAuth, useTasks, useRealtimeMessages)
- `lib/` — Types (`types.ts`) and constants (`constants.tsx`)
- `styles/globals.css` — Tailwind directives + custom CSS (glass-card, aura-breathing animations)

Path alias: `@` maps to `client/src/`

### Server Architecture (`server/src/`)
- `routes/` — Express route handlers: auth, tasks, mood, groups, messages, posts, ai, activity
- `middleware/auth.ts` — JWT verification middleware (exports `AuthRequest` type and `authenticate` function)
- `socket/chatHandler.ts` — Socket.io event handlers for real-time group chat and DMs
- `lib/gemini.ts` — Gemini API wrapper (getChatResponse, generateDailyTasks)
- `prisma/schema.prisma` — Database schema (User, MoodEntry, DailyTask, ActivityLog, Group, GroupMember, Message, CommunityPost, PostLike, AIConversation)

### API Proxy Pattern
The Vite dev server proxies `/api` requests to the Express server (port 3001). Gemini API calls go through the Express server to keep the API key secure. Voice sessions use `GET /api/ai/session-key` to fetch the key at runtime.

### Real-time Messaging
Socket.io handles group chat and direct messages. Socket connections authenticate via JWT in the handshake. Events: `join-group`, `leave-group`, `group-message`, `direct-message`, `new-message`.

### Critical Code
- **`client/src/pages/Chat.tsx`** — Complex bidirectional audio streaming with Gemini Live API. Manages AudioContext refs for 16kHz input / 24kHz output, graceful goodbye flow. Handle with extreme care.
- **`client/src/pages/Games.tsx`** — 5 mindfulness activities (breathing 4-4-6, grounding 5-4-3-2-1, soundscape mixer, walk timer, detox timer)
- **Task state** is shared between Dashboard and Chat via the database (Chat reads pending tasks to include in AI therapist context)
