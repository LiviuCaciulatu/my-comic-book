"use client";

import { useEffect, useState } from "react";
import CreateCharacter from "@/components/CreateCharacter";
import CreateComicBook from "@/components/CreateComicBook";

type CharacterCard = {
  id: string;
  name: string;
  faceImageUrl: string | null;
};

export default function ComicBookPage() {
  const [showCharacterForm, setShowCharacterForm] = useState(false);
  const [showComicForm, setShowComicForm] = useState(false);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);

  async function loadCharacters() {
    const res = await fetch("/api/characters/list");
    if (!res.ok) {
      setCharacters([]);
      return;
    }

    const data = await res.json();
    setCharacters(data.characters ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCharacters();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 px-6 py-6">
      {showCharacterForm && (
        <CreateCharacter
          onClose={() => {
            setShowCharacterForm(false);
            void loadCharacters();
          }}
        />
      )}

      {showComicForm && (
        <CreateComicBook
          characters={characters.map((character) => ({
            id: character.id,
            name: character.name,
          }))}
          onClose={() => setShowComicForm(false)}
        />
      )}

      <section className="mb-8">
        <div className="flex flex-wrap items-start gap-4">
          {characters.map((character) => (
            <article
              key={character.id}
              className="w-48 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="h-48 w-full overflow-hidden rounded-lg bg-gray-100">
                {character.faceImageUrl ? (
                  <img
                    src={character.faceImageUrl}
                    alt={character.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                    No face image
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-gray-800">
                {character.name}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <button
          onClick={() => setShowCharacterForm(true)}
          className="w-64 rounded-xl bg-indigo-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Create My Character
        </button>
        <button
          onClick={() => setShowComicForm(true)}
          className="w-64 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Create A Comic Book
        </button>
      </section>
    </main>
  );
}
