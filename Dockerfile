# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 - install production dependencies only
###############################################################################
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

###############################################################################
# Stage 2 - install everything and run the suite.
#
# Not a dependency of the runtime stage, so a plain `docker build` skips it.
# Run it explicitly in CI:  docker build --target test .
###############################################################################
FROM node:22-alpine AS test

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY tests ./tests
ENV NODE_ENV=test
RUN npm test

###############################################################################
# Stage 3 - runtime
###############################################################################
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app

# The base image ships an unprivileged `node` user; use it rather than root.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# `node src/server.js` as PID 1 keeps SIGTERM reaching the graceful shutdown
# handler; there is no npm wrapper process in between.
CMD ["node", "src/server.js"]
