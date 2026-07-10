import type PocketBase from 'pocketbase';

/** A signed-in user, as surfaced on the server and to pages. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  /** Optional name-display prefs (see displayName.js); default = first name only. */
  nickname?: string;
  show_last_name?: boolean;
  /** Temperature unit for the weather forecast (see prefs.js); '' reads as 'F'. */
  temp_unit?: string;
  /** Calendar tier new trips start at (see visibility.js); '' reads as 'friends'. */
  default_trip_visibility?: string;
}

declare global {
  namespace App {
    interface Locals {
      /** Per-request PocketBase client carrying the user's auth (or empty). */
      pb: PocketBase;
      /** The signed-in user, or null when not authenticated. */
      user: SessionUser | null;
    }
    interface PageData {
      user?: SessionUser | null;
    }
  }
}

export {};
