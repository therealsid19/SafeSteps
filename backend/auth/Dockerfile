<<<<<<< HEAD
FROM oven/bun:1.3.7

WORKDIR /app

# Install deps first so they're cached between code changes.
# Dev deps are kept: drizzle-kit runs the migrations on startup.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
=======
FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
>>>>>>> 5c5a843 (?)

COPY . .

ENV NODE_ENV=production
EXPOSE 8000
<<<<<<< HEAD

# Apply pending migrations in ./drizzle, then start the API
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
=======
CMD ["bun", "run", "start"]
>>>>>>> 5c5a843 (?)
