import { Alert, Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The subset of an RTK Query result object that the state components inspect. */
export interface QueryStateLike<T> {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  isUninitialized?: boolean;
}

/**
 * Alert shown when a backend query failed (connection lost, backend down or
 * returning an error), so the user is told the data is unavailable instead of
 * seeing an empty list or calendar.
 */
export function QueryError() {
  const { t } = useTranslation();
  return (
    <Alert color="red" variant="light" role="alert">
      {t('common.dataUnavailable')}
    </Alert>
  );
}

interface QueryStateProps<T> {
  query: QueryStateLike<T>;
  /** Renders the successfully loaded data. */
  children: (data: T) => ReactNode;
}

/**
 * Renders the three states of a backend query explicitly: a loading indicator
 * while the first request is pending, a clear error alert when the request
 * failed, and the children only for a successful response (a genuinely empty
 * result is rendered by the children as an explicit empty state). A skipped
 * query (skipToken) renders nothing.
 */
export default function QueryState<T>({ query, children }: QueryStateProps<T>) {
  const { t } = useTranslation();
  if (query.isError) {
    return <QueryError />;
  }
  if (query.isUninitialized) return null;
  if (query.isLoading || query.data === undefined) {
    return (
      <Center p="md">
        <Loader size="sm" aria-label={t('common.loading')} />
      </Center>
    );
  }
  return <>{children(query.data)}</>;
}
