import { Link } from 'react-router';

export default function NotFound() {
  return (
    <main className="px-4 pt-10">
      <h1 className="text-[24px] font-bold">Page not found</h1>
      <p className="mt-2 text-ink-2">The link may be old. Your tests and progress are safe on this phone.</p>
      <Link to="/" className="mt-6 inline-flex min-h-12 items-center rounded-[12px] bg-pen px-4 font-semibold text-on-status">
        Go home
      </Link>
    </main>
  );
}
