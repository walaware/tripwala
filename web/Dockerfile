# SvelteKit (adapter-node) production image.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
# pnpm-workspace.yaml carries the allowBuilds allowlist that pnpm 10+ requires
# before it will run @walaware/design's `prepare` script. Without it, install
# hard-fails with ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build"]
