"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CreateUserResponse = {
  client?: {
    id: string;
    email: string;
    full_name: string;
    preferred_language: string;
    created_at: string;
  };
  error?: string;
};

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ro", label: "Romanian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

export default function CreateUser() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      fullName: String(formData.get("fullName") || ""),
      preferredLanguage: String(formData.get("preferredLanguage") || "en"),
      consentAccepted: formData.get("consentAccepted") === "on",
    };

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as CreateUserResponse;

      if (!response.ok || !data.client) {
        setError(data.error || "Could not create user.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.email,
        password: payload.password,
      });

      if (signInError) {
        setError(
          "User created, but automatic login failed. Please log in manually.",
        );
        router.push("/login");
        return;
      }

      setSuccessMessage(
        `Created ${data.client.full_name} (${data.client.email}) successfully.`,
      );
      form.reset();
      router.push("/comic-book");
    } catch {
      setError("Could not connect to the create user API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
          Supabase Clients
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-900">
          Create User
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          This creates both the Supabase Auth account and the matching
          <span className="font-medium text-gray-900"> clients </span>
          record in one request.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-gray-800">
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-800">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="jane@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-800">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label
            htmlFor="preferredLanguage"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            Preferred Language
          </label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue="en"
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <input
            id="consentAccepted"
            name="consentAccepted"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            I have the required consent to upload or use child-related images and
            data.
          </span>
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {isSubmitting ? "Creating user..." : "Create user"}
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {successMessage ? (
          <p className="text-sm text-green-700">{successMessage}</p>
        ) : null}
      </form>
    </section>
  );
}