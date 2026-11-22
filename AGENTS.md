# Project conventions

- Migration policy updated by the user on 2026-11-23: preserve existing migrations and create new incremental migrations for schema changes. Update `prisma/schema.prisma` to match; do not consolidate or rewrite the init or other existing migrations.
- Use lowercase snake_case database table names with Prisma `@@map` while retaining TypeScript model names.
- Do not reset or migrate the user's database automatically. Document required setup commands in README.md.
- PostgreSQL is supplied by the user; do not introduce Docker Compose.
- Password minimum is 8 characters.
