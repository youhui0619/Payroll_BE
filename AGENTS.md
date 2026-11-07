# Project conventions

- During the current MVP development phase, maintain one consolidated init migration at `prisma/migrations/20261028132921_init/migration.sql`. The user plans to reset the database after development. Add new implemented models/relations to `prisma/schema.prisma` and regenerate init SQL to match; do not create incremental migrations until the user freezes the initial schema or changes this instruction.
- Use lowercase snake_case database table names with Prisma `@@map` while retaining TypeScript model names.
- Do not reset or migrate the user's database automatically. Document required setup commands in README.md.
- PostgreSQL is supplied by the user; do not introduce Docker Compose.
- Password minimum is 8 characters.
