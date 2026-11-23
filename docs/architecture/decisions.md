# IBazzzar implementation design

Authority: ../../MASTER_PROMPT.md. User requested immediate implementation on 2026-11-19; use the specified stack and safe defaults without another design approval round.

Next.js App Router/TypeScript storefront, Express native ESM modular monolith, Prisma/PostgreSQL persistence, optional Redis/BullMQ worker. All prices are integer paise at API/domain boundaries and Decimal rupees in PostgreSQL. Server owns prices, roles, stock and state transitions. Same-origin Next rewrite forwards /api to Express; HTTP-only sessions and strict Origin checks protect mutations.

New workspace has no Git repository or existing application. Work directly in the user-selected C:/ibazzzar. No worktree or database reset needed. Native Windows npm.cmd avoids PowerShell script execution policy changes.

Database is unavailable initially. Explicit demo mode uses isolated process memory with seeded demonstration products and separate test stores. Production refuses demo mode. Prisma schema and repository implement persistent mode; no existing database is accessed automatically. Real services are disabled until configured. Seeded accounts do not have public default passwords.

Ivory product surfaces, emerald navigation and story sections, gold details. Original logo required at public/branding/ibazzzar-logo.png, mirrored to apps/web/public/branding by asset sync. Until received, show text indicating the missing official asset. Product illustrations and brand storytelling must be labelled as demonstration material.

Approaches: selected modular monolith follows the supplied spec. Microservices add unnecessary coordination. Static-only storefront cannot satisfy checkout and tenant isolation.

Delivery is local only. No deployment, DNS or real payment activity. Progress reports distinguish implemented behavior, tested behavior and remaining release blockers.
