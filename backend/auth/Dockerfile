FROM oven/bun:1.3.7

WORKDIR /app

# Install deps first so they're cached between code changes.
# Dev deps are kept: drizzle-kit runs the migrations on startup.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 8000

# Apply pending migrations in ./drizzle, then start the API
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run start"]
