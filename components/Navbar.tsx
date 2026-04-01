"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// loadUserInfo uses /api/user/profile (server-side, bypasses RLS)

type UserInfo = {
  fullName: string;
  balance: number;
};

export default function Navbar() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tokenAmount, setTokenAmount] = useState<number>(0);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/home");
  }

  async function loadUserInfo() {
    const res = await fetch("/api/user/profile");
    if (!res.ok) {
      // Stale session — sign out silently and clear UI
      if (res.status === 401) {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        setUserInfo(null);
      }
      return;
    }
    const data = await res.json();
    setUserInfo({ fullName: data.fullName, balance: data.balance });
  }

  useEffect(() => {
    loadUserInfo();
  }, []);

  // Refresh displayed balance after token-affecting actions elsewhere in the app.
  useEffect(() => {
    function handleTokenWalletUpdated() {
      loadUserInfo();
    }

    window.addEventListener("token-wallet-updated", handleTokenWalletUpdated);
    return () => {
      window.removeEventListener("token-wallet-updated", handleTokenWalletUpdated);
    };
  }, []);

  // Close modal on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setModalOpen(false);
        setAddError(null);
      }
    }
    if (modalOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modalOpen]);

  async function handleAddTokens() {
    if (!tokenAmount || tokenAmount < 1) {
      setAddError("Enter a positive number of tokens.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/tokens/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tokenAmount }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error ?? "Failed to add tokens.");
      } else {
        setModalOpen(false);
        setTokenAmount(0);
        await loadUserInfo();
        window.dispatchEvent(new CustomEvent("token-wallet-updated"));
      }
    } catch {
      setAddError("Unexpected error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <nav className="relative flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
      {/* left — user info */}
      <div className="w-1/3">
        {userInfo ? (
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <span className="font-medium">{userInfo.fullName}</span>
            <button
              onClick={() => { setModalOpen(true); setAddError(null); }}
              className="rounded-full bg-indigo-100 px-3 py-0.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-200 transition-colors cursor-pointer"
            >
              {userInfo.balance} tokens
            </button>
          </div>
        ) : null}
      </div>

      {/* center — site title */}
      <div className="w-1/3 text-center">
        <span className="text-xl font-bold tracking-wide text-gray-900">
          MyComicBook
        </span>
      </div>

      {/* right — logout */}
      <div className="flex w-1/3 justify-end">
        {userInfo && (
          <button
            onClick={handleLogout}
            className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Log out
          </button>
        )}
      </div>

      {/* Token modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-start pt-16 pl-6">
          <div
            ref={modalRef}
            className="w-64 rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
          >
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Add Tokens</h3>
            <input
              type="number"
              min={1}
              value={tokenAmount || ""}
              onChange={(e) => setTokenAmount(Number(e.target.value))}
              placeholder="Number of tokens"
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
            />
            {addError && (
              <p className="mb-2 text-xs text-red-500">{addError}</p>
            )}
            <button
              onClick={handleAddTokens}
              disabled={adding}
              className="w-full rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding…" : "Add Tokens"}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
