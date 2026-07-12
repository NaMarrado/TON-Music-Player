/**
 * Smart Playlist Query Builder.
 *
 * Converts SmartPlaylistConfig rules into SQL WHERE clause + params.
 * Pure TypeScript - shared between desktop and mobile.
 */

import type { SmartPlaylistConfig, SmartRule, SmartRuleField } from '../types/playlist';

export interface SmartPlaylistQuery {
  sql: string;
  params: unknown[];
}

/** Allowed column names to prevent SQL injection via field names. */
const ALLOWED_FIELDS: ReadonlySet<SmartRuleField> = new Set([
  'artist',
  'album',
  'genre',
  'year',
  'play_count',
  'rating',
  'added_at',
  'last_played_at',
  'duration_ms',
]);

const DEFAULT_SORT = 'added_at';

/**
 * Build a SELECT query for tracks matching smart playlist rules.
 * Returns the full SQL and parameterized values.
 */
export function buildSmartPlaylistQuery(config: SmartPlaylistConfig): SmartPlaylistQuery {
  const params: unknown[] = [];
  const conditions: string[] = [];

  for (const rule of config.rules) {
    if (!ALLOWED_FIELDS.has(rule.field)) continue;
    const condition = buildCondition(rule, params);
    if (condition) conditions.push(condition);
  }

  let sql = 'SELECT * FROM tracks';

  if (conditions.length > 0) {
    const joiner = config.logic === 'any' ? ' OR ' : ' AND ';
    sql += ` WHERE (${conditions.join(joiner)})`;
  }

  // Sort
  const sortField = config.sort_by && ALLOWED_FIELDS.has(config.sort_by as SmartRuleField)
    ? config.sort_by
    : DEFAULT_SORT;
  const sortOrder = config.sort_order === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortField} ${sortOrder}`;

  // Limit
  if (config.limit && config.limit > 0) {
    sql += ` LIMIT ?`;
    params.push(config.limit);
  }

  return { sql, params };
}

function buildCondition(rule: SmartRule, params: unknown[]): string | null {
  const field = rule.field;

  switch (rule.operator) {
    case 'equals':
      params.push(rule.value);
      return `${field} = ?`;

    case 'not_equals':
      params.push(rule.value);
      return `${field} != ?`;

    case 'contains':
      params.push(rule.value);
      return `${field} LIKE '%' || ? || '%'`;

    case 'not_contains':
      params.push(rule.value);
      return `${field} NOT LIKE '%' || ? || '%'`;

    case 'greater_than':
      params.push(rule.value);
      return `${field} > ?`;

    case 'less_than':
      params.push(rule.value);
      return `${field} < ?`;

    case 'between':
      params.push(rule.value, rule.value2 ?? rule.value);
      return `${field} BETWEEN ? AND ?`;

    case 'in_last_days':
      params.push(Number(rule.value) * 86400);
      return `${field} > strftime('%s','now') - ?`;

    default:
      return null;
  }
}
