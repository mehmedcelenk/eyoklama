/**
 * Supabase Client Singleton
 * Vibecoding-Safe Native DOM Architecture
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

let clientInstance: SupabaseClient | null = null;

/**
 * Returns the Supabase client singleton instance.
 * Initializes with session persistence disabled for stateless token auth.
 *
 * @returns SupabaseClient instance
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    const wsTransport = typeof WebSocket !== 'undefined' ? WebSocket : class NoopWebSocket {};
    clientInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
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
