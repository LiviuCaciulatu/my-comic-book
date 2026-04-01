"use client";

import { useEffect, useState } from "react";
import CreateCharacter from "@/components/CreateCharacter";
import CreateComicBook from "@/components/CreateComicBook";

type CharacterCard = {
  id: string;
  name: string;
  faceImageUrl: string | null;
};

type ProjectCard = {
  id: string;
  title: string;
  genre: string | null;
  age_group: string | null;
  cover_image_url: string | null;
};

type ProjectPage = {
  page_number: number;
  page_type: string;
  image_url: string | null;
};

export default function ComicBookPage() {
  const [showCharacterForm, setShowCharacterForm] = useState(false);
  const [showComicForm, setShowComicForm] = useState(false);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [viewerPages, setViewerPages] = useState<ProjectPage[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerProjectId, setViewerProjectId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadCharacters() {
    const res = await fetch("/api/characters/list");
    if (!res.ok) {
      setCharacters([]);
      return;
    }
    const data = await res.json();
    setCharacters(data.characters ?? []);
  }

  async function loadProjects() {
    const res = await fetch("/api/projects/list");
    if (!res.ok) {
      setProjects([]);
      return;
    }
    const data = await res.json();
    setProjects(data.projects ?? []);
  }

  async function openProjectViewer(project_id: string) {
    const res = await fetch(`/api/projects/pages?project_id=${project_id}`);
    if (!res.ok) return;
    const data = await res.json();
    const pages: ProjectPage[] = data.pages ?? [];
    if (pages.length === 0) return;
    setViewerIndex(0);
    setViewerPages(pages);
    setViewerProjectId(project_id);
  }

  async function downloadPdf() {
    if (!viewerProjectId) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/projects/download-pdf?project_id=${viewerProjectId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.split('filename="')[1]?.replace('"', '') ?? "comic.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function deleteCharacter(id: string) {
    if (!confirm("Delete this character? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/characters?id=${id}`, { method: "DELETE" });
      void loadCharacters();
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this comic book and all its pages? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
      void loadProjects();
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCharacters();
      void loadProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 px-6 py-6">
      {viewerPages !== null && (() => {
        const page = viewerPages[viewerIndex];
        const total = viewerPages.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {page.page_type === "cover" ? "Front Cover" : page.page_type === "back" ? "Back Cover" : `Page ${page.page_number}`}
                </p>
                <span className="text-sm text-gray-400">{viewerIndex + 1} / {total}</span>
                <button
                  onClick={() => setViewerPages(null)}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>
              <div className="flex items-center justify-center bg-gray-100" style={{ minHeight: 480 }}>
                {page.image_url ? (
                  <img
                    src={page.image_url}
                    alt={`Page ${page.page_number}`}
                    className="max-h-[70vh] w-auto object-contain"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                    No image available
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t px-6 py-4">
                <button
                  onClick={() => setViewerIndex((i) => Math.max(0, i - 1))}
                  disabled={viewerIndex === 0}
                  className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => void downloadPdf()}
                  disabled={downloadingPdf}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {downloadingPdf ? "Building PDF…" : "⬇ Download PDF"}
                </button>
                <button
                  onClick={() => setViewerIndex((i) => Math.min(total - 1, i + 1))}
                  disabled={viewerIndex === total - 1}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          onClose={() => {
            setShowComicForm(false);
            void loadProjects();
          }}
        />
      )}

      {/* Character cards */}
      {characters.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Characters
          </h2>
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
                <button
                  onClick={() => void deleteCharacter(character.id)}
                  disabled={deletingId === character.id}
                  className="mt-2 w-full rounded-lg border border-red-200 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
                >
                  {deletingId === character.id ? "Deleting…" : "Delete"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Comic book project cards */}
      {projects.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            My Comic Books
          </h2>
          <div className="flex flex-wrap items-start gap-4">
            {projects.map((project) => (
              <article
                key={project.id}
                onClick={() => void openProjectViewer(project.id)}
                className="w-48 cursor-pointer rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="h-64 w-full overflow-hidden rounded-lg bg-gray-100">
                  {project.cover_image_url ? (
                    <img
                      src={project.cover_image_url}
                      alt={project.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400">
                      <span className="text-3xl">📖</span>
                      <span className="text-xs">No cover yet</span>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-center text-sm font-semibold text-gray-800">
                  {project.title}
                </p>
                {project.genre && (
                  <p className="text-center text-xs text-gray-500">{project.genre}</p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); void deleteProject(project.id); }}
                  disabled={deletingId === project.id}
                  className="mt-2 w-full rounded-lg border border-red-200 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
                >
                  {deletingId === project.id ? "Deleting…" : "Delete"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

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
