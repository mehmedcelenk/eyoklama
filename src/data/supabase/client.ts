/**
 * Supabase Client Singleton
 * Vibecoding-Safe Native DOM Architecture
 * Supports multi-tenant dynamic client resolution based on active institution
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getActiveInstitution } from './config';

let clientInstance: SupabaseClient | null = null;
let currentInstSlug: string | null = null;

/**
 * Returns the Supabase client singleton instance for the active institution.
 * Dynamically reinitializes if the active institution changes.
 *
 * @returns SupabaseClient instance
 */
export function getSupabaseClient(): SupabaseClient {
  const activeInst = getActiveInstitution();

  if (!clientInstance || currentInstSlug !== activeInst.slug) {
    currentInstSlug = activeInst.slug;
    const wsTransport = typeof WebSocket !== 'undefined' ? WebSocket : class NoopWebSocket {};
    clientInstance = createClient(activeInst.supabaseUrl, activeInst.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        transport: wsTransport as any
      }
    });
  }
  return clientInstance;
}

/**
 * Sets a custom SupabaseClient instance (e.g. for testing/mocking).
 */
export function setSupabaseClient(mockClient: SupabaseClient | null): void {
  clientInstance = mockClient;
}

/**
 * Export default client singleton getter
 */
export const supabase = {
  get client(): SupabaseClient {
    return getSupabaseClient();
  }
};
