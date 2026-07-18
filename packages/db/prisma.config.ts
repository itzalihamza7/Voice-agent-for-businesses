import { defineConfig } from "prisma/config";

// Prisma CLI settings. DATABASE_URL is set automatically inside DDEV.
// It is read directly (not with Prisma's env()) so `prisma generate` also works
// without a database, e.g. during `npm install` or in CI.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
