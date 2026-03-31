import Link from "next/link";

export default function ChildrensBookPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900">
      <div className="max-w-3xl text-center p-8">
        <h1 className="text-4xl font-extrabold mb-4">Children&apos;s Book</h1>
        <p className="text-lg text-gray-700 mb-6">
          Welcome to the children&apos;s book section.
        </p>
        <Link
          href="/"
          className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-100"
        >
          Back Home
        </Link>
      </div>
    </main>
  );
}
