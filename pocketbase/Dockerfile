# Pinned PocketBase build. Migrations in pb_migrations/ apply automatically on
# `serve`. pb_data is a mounted volume (see compose.yml) so it persists.
FROM alpine:3.20

ARG PB_VERSION=0.39.4
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget

WORKDIR /pb

RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb \
    && rm /tmp/pb.zip

COPY pb_migrations /pb/pb_migrations
# Curated API Access surface (/api/x/v1/*). PocketBase loads JS hooks from
# pb_hooks/ automatically on serve. See pb_hooks/api_x.pb.js and docs/for-api.md.
COPY pb_hooks /pb/pb_hooks

EXPOSE 8090

# 0.0.0.0 so the container is reachable from the web service / reverse proxy.
ENTRYPOINT ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
