import type { PGlite } from '@electric-sql/pglite';
import type { ClientBase, QueryResult, QueryResultRow } from 'pg';

/**
 * Minimal pg ClientBase adapter around a PGlite instance, so node-pg-migrate
 * can run migrations against the in-process test database. Only the `query`
 * method is needed: node-pg-migrate treats any object with a `query` function
 * as an external client and never calls `connect()` or `end()` on it.
 */
export function createPgliteClient(pglite: PGlite): ClientBase {
  const client = {
    query: async <R extends QueryResultRow = QueryResultRow>(
      queryTextOrConfig: string | { text: string; values?: unknown[] },
      values?: unknown[],
    ): Promise<QueryResult<R>> => {
      const text =
        typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig.text;
      const params =
        (typeof queryTextOrConfig === 'string' ? values : queryTextOrConfig.values) ?? [];
      const result = await pglite.query<R>(text, params as never[]);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
        command: '',
        oid: 0,
        fields: result.fields.map(field => ({
          name: field.name,
          tableID: 0,
          columnID: 0,
          dataTypeID: field.dataTypeID,
          dataTypeSize: 0,
          dataTypeModifier: 0,
          format: 'text',
        })),
      };
    },
  };
  return client as unknown as ClientBase;
}
