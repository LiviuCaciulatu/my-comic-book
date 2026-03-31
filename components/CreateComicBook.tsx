"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";

type CharacterOption = {
  id: string;
  name: string;
};

type StylePreset = {
  id: string;
  style_name: string;
};

type ProjectPayload = {
  title: string;
  issue_number: string;
  series_name: string;
  project_type: string;
  age_group: string;
  genre: string;
  style_key: string;
  short_idea: string;
  main_character_id: string;
  main_character_role: string;
  text_language: string;
  page_count: string;
  synopsis?: string;
};

type Props = {
  characters: CharacterOption[];
  onClose: () => void;
};

const AGE_GROUPS = [
  "3-4yo",
  "5-6yo",
  "7-8yo",
  "8-12yo",
  "12-14yo",
  "14-16yo",
];

const GENRES = [
  "Adventure",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Comedy",
  "Slice of Life",
  "Superhero",
  "Educational",
  "Horror",
  "Drama",
];

const MAIN_CHARACTER_ROLES = [
  "Hero",
  "Antihero",
  "Explorer",
  "Leader",
  "Guardian",
  "Comic Relief",
  "Mentor",
  "Underdog",
];

const TEXT_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ro", label: "Romanian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
];

const PAGE_COUNTS = [10, 20, 40];

export default function CreateComicBook({ characters, onClose }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [generatedSynopsis, setGeneratedSynopsis] = useState<string | null>(null);
  const [editedSynopsis, setEditedSynopsis] = useState("");
  const [pendingProjectPayload, setPendingProjectPayload] = useState<ProjectPayload | null>(null);
  const [generatingVisualBible, setGeneratingVisualBible] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);

  useEffect(() => {
    async function loadStyles() {
      try {
        const res = await fetch("/api/styles");
        if (res.ok) {
          const json = await res.json();
          setStyles(json.styles || []);
        }
      } catch (err) {
        console.error("Failed to load styles:", err);
      } finally {
        setStylesLoading(false);
      }
    }
    loadStyles();
  }, []);

  const canSubmit = useMemo(() => characters.length > 0, [characters.length]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Create at least one character first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      title: String(formData.get("title") ?? "").trim(),
      issue_number: String(formData.get("issue_number") ?? "").trim(),
      series_name: String(formData.get("series_name") ?? "").trim(),
      project_type: "comic",
      age_group: String(formData.get("age_group") ?? "").trim(),
      genre: String(formData.get("genre") ?? "").trim(),
      style_key: String(formData.get("style_key") ?? "").trim(),
      short_idea: String(formData.get("short_idea") ?? "").trim(),
      main_character_id: String(formData.get("main_character_id") ?? "").trim(),
      main_character_role: String(formData.get("main_character_role") ?? "").trim(),
      text_language: String(formData.get("text_language") ?? "en").trim(),
      page_count: String(formData.get("page_count") ?? "10").trim(),
    };

    try {
      // Step 1: Generate synopsis
      console.log("🚀 Step 1: Generating synopsis with payload:", {
        short_idea: payload.short_idea,
        age_group: payload.age_group,
        genre: payload.genre,
        main_character_id: payload.main_character_id,
        main_character_role: payload.main_character_role,
        text_language: payload.text_language,
        series_name: payload.series_name || "N/A",
        issue_number: payload.issue_number || "N/A",
      });

      const synopsisRes = await fetch("/api/projects/generate-synopsis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          short_idea: payload.short_idea,
          age_group: payload.age_group,
          genre: payload.genre,
          main_character_id: payload.main_character_id,
          main_character_role: payload.main_character_role,
          text_language: payload.text_language,
          series_name: payload.series_name || undefined,
          issue_number: payload.issue_number ? Number(payload.issue_number) : undefined,
        }),
      });

      const synopsisJson = await synopsisRes.json();
      console.log("📚 Synopsis generation response:", synopsisJson);

      if (!synopsisRes.ok) {
        throw new Error(synopsisJson.error || "Failed to generate synopsis");
      }

      const synopsis = synopsisJson.synopsis;
      console.log("✅ Generated synopsis:", synopsis);

      // Store synopsis and payload for user review
      setGeneratedSynopsis(synopsis);
      setEditedSynopsis(synopsis);
      setPendingProjectPayload({ ...payload, synopsis });
      setIsSubmitting(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      console.error("❌ Error:", errorMsg);
      setError(errorMsg);
      setIsSubmitting(false);
    }
  }

  async function handleConfirmSynopsis() {
    if (!pendingProjectPayload) return;

    setIsSubmitting(true);
    setError("");

    try {
      // Step 2: Create project with edited synopsis
      console.log("🚀 Step 2: Creating project with user-edited synopsis");
      const projectPayload = {
        ...pendingProjectPayload,
        synopsis: editedSynopsis,
      };

      console.log("📝 Final project payload:", projectPayload);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(projectPayload),
      });

      const json = await res.json();
      console.log("📊 Project creation response:", json);

      if (!res.ok) {
        throw new Error(json.error || "Failed to create project");
      }

      console.log("✅ Project created successfully with ID:", json.id);
      
      // Step 3: Generate visual bible
      setGeneratedSynopsis(null);
      setEditedSynopsis("");
      setPendingProjectPayload(null);
      setGeneratingVisualBible(true);
      console.log("🚀 Step 3: Starting visual bible generation for project:", json.id);
      
      try {
        const visualBibleRes = await fetch("/api/projects/generate-visual-bible", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_id: json.id,
            character_id: pendingProjectPayload.main_character_id,
            style_key: pendingProjectPayload.style_key,
          }),
        });

        const visualBibleJson = await visualBibleRes.json();
        console.log("🎨 Visual bible generation response:", visualBibleJson);

        if (!visualBibleRes.ok) {
          throw new Error(visualBibleJson.error || "Failed to generate visual bible");
        }

        console.log("✅ Visual bible generated and saved successfully");
        
        // Step 4: Generate comic script
        setGeneratingVisualBible(false);
        setGeneratingScript(true);
        
        console.log("🚀 Step 4: Starting comic script generation for project:", json.id);
        
        try {
          const scriptRes = await fetch("/api/projects/generate-script", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              project_id: json.id,
            }),
          });

          const scriptJson = await scriptRes.json();
          console.log("📖 Comic script generation response:", scriptJson);

          if (!scriptRes.ok) {
            throw new Error(scriptJson.error || "Failed to generate comic script");
          }

          console.log("✅ Comic script generated and saved successfully");
          setGeneratingScript(false);
          onClose();
        } catch (scriptErr) {
          const errorMsg = scriptErr instanceof Error ? scriptErr.message : "Failed to generate comic script";
          console.error("❌ Comic script error:", errorMsg);
          setError(errorMsg);
          setGeneratingScript(false);
          setIsSubmitting(false);
        }
      } catch (visualBibleErr) {
        const errorMsg = visualBibleErr instanceof Error ? visualBibleErr.message : "Failed to generate visual bible";
        console.error("❌ Visual bible error:", errorMsg);
        setError(errorMsg);
        setGeneratingVisualBible(false);
        setIsSubmitting(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      console.error("❌ Error:", errorMsg);
      setError(errorMsg);
      setIsSubmitting(false);
    }
  }

  function handleCancelSynopsis() {
    setGeneratedSynopsis(null);
    setEditedSynopsis("");
    setPendingProjectPayload(null);
    setError("");
  }

  if (isSubmitting && generatedSynopsis === null && !generatingVisualBible) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="mb-2 text-xl font-bold text-gray-900">Generating synopsis...</p>
          <p className="text-gray-600">Creating story outline with AI.</p>
        </div>
      </div>
    );
  }

  if (generatingVisualBible) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="mb-2 text-xl font-bold text-gray-900">Generating visual bible...</p>
          <p className="text-gray-600">Creating character design & visual direction.</p>
        </div>
      </div>
    );
  }

  if (generatingScript) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="mb-2 text-xl font-bold text-gray-900">Generating comic script...</p>
          <p className="text-gray-600">Creating page-level narrative.</p>
        </div>
      </div>
    );
  }

  if (generatedSynopsis !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
        <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-xl font-bold text-gray-900">Review Synopsis</h2>
            <button
              onClick={handleCancelSynopsis}
              className="text-2xl leading-none text-gray-400 hover:text-gray-600"
              disabled={isSubmitting}
            >
              &times;
            </button>
          </div>

          <div className="space-y-4 px-6 py-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
            <p className="text-sm font-semibold text-gray-700">Generated Synopsis:</p>
            <textarea
              value={editedSynopsis}
              onChange={(e) => setEditedSynopsis(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              rows={6}
              placeholder="Your synopsis will appear here..."
            />
            <p className="text-xs text-gray-500">
              You can edit the synopsis above before confirming.
            </p>
          </div>

          <div className="flex gap-3 border-t px-6 py-4">
            <button
              onClick={handleCancelSynopsis}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSynopsis}
              disabled={isSubmitting || !editedSynopsis.trim()}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-center font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="mb-2 text-xl font-bold text-gray-900">Creating project...</p>
          <p className="text-gray-600">Saving to database.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">Create A Comic Book</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Issue title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Issue Number <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <select
                name="issue_number"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                defaultValue=""
              >
                <option value="">- none -</option>
                {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Series Name <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                name="series_name"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Series title"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Project Type</label>
            <input
              value="comic"
              disabled
              className="w-full rounded-lg border bg-gray-100 px-3 py-2 text-sm text-gray-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Age Group</label>
              <select
                name="age_group"
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">- select -</option>
                {AGE_GROUPS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Genre</label>
              <select
                name="genre"
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">- select -</option>
                {GENRES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Style Key</label>
              <select
                name="style_key"
                defaultValue=""
                disabled={stylesLoading}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
              >
                <option value="">- select -</option>
                {styles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.style_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Short Idea <span className="text-red-500">*</span>
            </label>
            <textarea
              name="short_idea"
              required
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Briefly describe your comic idea"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Main Character <span className="text-red-500">*</span>
              </label>
              <select
                name="main_character_id"
                required
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">- select character -</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Main Character Role</label>
              <select
                name="main_character_role"
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">- select -</option>
                {MAIN_CHARACTER_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Text Language</label>
              <select
                name="text_language"
                defaultValue="en"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TEXT_LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Page Count</label>
              <select
                name="page_count"
                defaultValue="10"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PAGE_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!canSubmit && (
            <p className="text-sm text-amber-700">
              You need at least one created character before starting a comic project.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Create Comic Book"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}