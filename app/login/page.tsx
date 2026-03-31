import Link from "next/link";

import LoginUser from "@/components/LoginUser";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12 text-gray-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            Back home
          </Link>
        </div>
        <LoginUser />
      </div>
    </main>
  );
}