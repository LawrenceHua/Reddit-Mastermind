/**
 * Typed Supabase Client Helpers
 * 
 * These helpers provide proper type inference for Supabase queries
 * to work around issues with auto-generated types.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, InsertTables, UpdateTables } from '@/lib/database.types';

type TableName = keyof Database['public']['Tables'];

/**
 * Helper to create typed queries
 * This allows us to bypass strict type inference issues while maintaining
 * runtime safety
 */
export function typedFrom<T extends TableName>(
  client: SupabaseClient<Database>,
  table: T
) {
  return client.from(table) as any;
}

/**
 * Type assertion helper for query results
 */
export function asRow<T extends TableName>(data: any): Tables<T> | null {
  return data as Tables<T> | null;
}

export function asRows<T extends TableName>(data: any): Tables<T>[] {
  return (data ?? []) as Tables<T>[];
}

/**
 * Type-safe insert helper
 */
export function insertRow<T extends TableName>(data: InsertTables<T>): InsertTables<T> {
  return data;
}

/**
 * Type-safe update helper
 */
export function updateRow<T extends TableName>(data: UpdateTables<T>): UpdateTables<T> {
  return data;
}
