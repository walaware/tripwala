import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

// Server-side PocketBase URL. In dev this is the local binary; in Docker it is
// the service name. A fresh client is created per request to avoid leaking auth
// state between requests (PocketBase auth lives on the instance).
const PB_URL = env.PB_URL || 'http://127.0.0.1:8090';

export function createServerPb() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  return pb;
}
