import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteError() {
  const error = useRouteError();
  const chunkFailed = error instanceof Error && /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(error.message);
  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : chunkFailed
      ? 'This screen has not been downloaded to your phone yet and you are offline. Connect once and open it again.'
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';
  return (
    <main className="app-column px-4 pt-10">
      <h1 className="text-[24px] font-bold">This screen could not open</h1>
      <p className="mt-2 text-ink-2">{message}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" className="min-h-12 rounded-[12px] bg-pen px-4 font-semibold text-on-status" onClick={() => location.reload()}>
          Reload
        </button>
        <Link to="/" className="flex min-h-12 items-center rounded-[12px] border border-line px-4 font-semibold">
          Go home
        </Link>
      </div>
    </main>
  );
}
