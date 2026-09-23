import { useEffect, useState, type DependencyList } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): { data: T | undefined; error: Error | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: Error) => alive && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
