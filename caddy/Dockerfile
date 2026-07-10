# The edge proxy, with its config baked in — the same trick the pocketbase image
# uses for pb_migrations. Shipping the Caddyfile as part of an image means the
# public surface of the deployment is versioned, reviewed, and pulled from the
# same artifact stream as the app itself.
#
# Before this, production bind-mounted a hand-edited copy of the Caddyfile that
# had silently diverged from the repo's. A redeploy from the stale copy would
# have re-exposed the PocketBase REST API and the /_/ admin dashboard.
#
# Upstream hostnames differ per environment, so they come from env at RUN time
# (see the placeholders in Caddyfile), not from a second copy of the file:
#   PB_UPSTREAM   e.g. tripwala-pocketbase:8090   (default: pocketbase:8090)
#   WEB_UPSTREAM  e.g. tripwala-web:3000          (default: web:3000)
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile

# Fail the build rather than ship an edge config that won't parse. Upstreams are
# resolved at runtime, so validation here only checks syntax and structure.
RUN caddy validate --config /etc/caddy/Caddyfile
