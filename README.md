# BookWise

Team scheduling and booking platform. Built with Next.js 15, Prisma, and TypeScript.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── bookings/          — CRUD for bookings
│   │   │   ├── route.ts       — GET (list), POST (create)
│   │   │   └── [id]/route.ts  — GET (single), PATCH (update), DELETE (cancel)
│   │   └── teams/
│   │       └── [slug]/
│   │           └── bookings/route.ts  — GET team bookings
│   ├── layout.tsx
│   └── page.tsx
└── lib/
    ├── db.ts           — Prisma client singleton
    └── validators.ts   — Zod schemas for request validation
```

## Data Model

- **User** — team members with roles (ADMIN, MEMBER)
- **Team** — groups of users
- **Booking** — scheduled events with visibility controls (PUBLIC, PRIVATE, TEAM_ONLY)

## Running

```bash
npm install
npx prisma db push
npm run dev
```
