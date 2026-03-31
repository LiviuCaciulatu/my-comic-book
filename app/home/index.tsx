import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
      <div className="max-w-3xl p-8 text-center">
        <h1 className="mb-4 text-5xl font-extrabold">My Comic Book</h1>
        <p className="mb-8 text-lg text-gray-700">
          Create, collect, and read your favorite comics in one place.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/create-user"
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-700"
          >
            Create User
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-gray-300 bg-white px-6 py-3 font-medium text-gray-900 transition hover:bg-gray-100"
          >
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
