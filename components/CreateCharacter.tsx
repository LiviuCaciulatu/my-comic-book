"use client";

import { FormEvent, useState } from "react";

const CORE_TRAITS = [
  "Cheerful", "Optimistic", "Brave", "Curious", "Kind", "Calm", "Shy",
  "Playful", "Intelligent", "Creative", "Confident", "Friendly",
  "Adventurous", "Silly", "Helpful", "Honest", "Energetic", "Gentle",
  "Determined", "Loyal",
];

const SECONDARY_TRAITS = [
  "Mischievous", "Witty", "Stubborn", "Impatient", "Competitive", "Clumsy",
];

const DISTINCTIVE_FEATURES_OPTIONS = [
  "Glasses", "Earrings", "Scarves", "Freckles", "Moles", "Scars",
  "Dimples", "Beauty Marks", "Wrinkles",
];

type Props = { onClose: () => void };

export default function CreateCharacter({ onClose }: Props) {
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleTrait(trait: string) {
    setSelectedTraits((prev) =>
      prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
    );
  }

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  }

  function addCustomFeature() {
    const trimmed = customFeature.trim();
    if (trimmed && !selectedFeatures.includes(trimmed)) {
      setSelectedFeatures((prev) => [...prev, trimmed]);
      setCustomFeature("");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = new FormData();
    payload.append("name", String(data.get("name") || ""));
    payload.append("age", String(data.get("age") || ""));
    payload.append("gender", String(data.get("gender") || ""));
    payload.append("personality_traits", JSON.stringify(selectedTraits));
    payload.append("base_description", String(data.get("base_description") || ""));
    payload.append("hair_color", String(data.get("hair_color") || ""));
    payload.append("hair_style", String(data.get("hair_style") || ""));
    payload.append("hair_length", String(data.get("hair_length") || ""));
    payload.append("face_shape", String(data.get("face_shape") || ""));
    payload.append("distinctive_features", JSON.stringify(selectedFeatures));
    payload.append("eye_color", String(data.get("eye_color") || ""));
    payload.append("skin_tone", String(data.get("skin_tone") || ""));
    payload.append("outfit_preferences", String(data.get("outfit_preferences") || ""));
    const image = data.get("image") as File | null;
    if (image && image.size > 0) payload.append("image", image);

    try {
      const res = await fetch("/api/characters", { method: "POST", body: payload });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create character");
      window.dispatchEvent(new CustomEvent("token-wallet-updated"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  if (isSubmitting) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-xl font-bold text-gray-900 mb-2">Creating character...</p>
          <p className="text-gray-600">Generating face reference and saving everything.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">Create My Character</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Luna" />
          </div>

          {/* Age */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Age <span className="text-red-500">*</span></label>
            <input name="age" required type="number" min={1} max={120} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. 8" />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="gender" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Female" />
          </div>

          {/* Personality Traits */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Personality Traits <span className="text-gray-400 font-normal">(optional)</span></label>
            <p className="text-xs text-gray-500 mb-1">Core Traits</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {CORE_TRAITS.map((trait) => (
                <button
                  type="button"
                  key={trait}
                  onClick={() => toggleTrait(trait)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedTraits.includes(trait)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  {trait}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-1">Secondary Traits</p>
            <div className="flex flex-wrap gap-2">
              {SECONDARY_TRAITS.map((trait) => (
                <button
                  type="button"
                  key={trait}
                  onClick={() => toggleTrait(trait)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedTraits.includes(trait)
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
                  }`}
                >
                  {trait}
                </button>
              ))}
            </div>
          </div>

          {/* Base Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="base_description" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. A young wizard who loves animals" />
          </div>

          {/* Hair */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hair Color</label>
              <select name="hair_color" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Blonde","Brunette","Black","Red","Grey","White","Silver","Blue","Green","Purple","Pink","Ombre","Highlighted","Bald"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hair Style</label>
              <select name="hair_style" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Straight","Wavy","Curly","Braided","Ponytail","Bun","Mohawk","Shaved","Dreadlocks","Updo","Layered","Messy"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hair Length</label>
              <select name="hair_length" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Short","Medium","Long","Shoulder-length","Pixie","Bob","Waist-length"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Face & Eyes & Skin */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Face Shape</label>
              <select name="face_shape" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Oval","Round","Square","Heart","Diamond","Rectangle","Triangle","Pear"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eye Color</label>
              <select name="eye_color" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Brown","Dark Brown","Hazel","Green","Blue","Grey","Amber","Violet","Heterochromatic"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skin Tone</label>
              <select name="skin_tone" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— none —</option>
                {["Very fair","Fair","Light","Medium","Olive","Tan","Brown","Dark Brown","Deep"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Distinctive Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Distinctive Features <span className="text-gray-400 font-normal">(optional, multi-select)</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DISTINCTIVE_FEATURES_OPTIONS.map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedFeatures.includes(f)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-emerald-400"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={customFeature}
                onChange={(e) => setCustomFeature(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomFeature(); }}}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Add your own feature…"
              />
              <button
                type="button"
                onClick={addCustomFeature}
                className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Add
              </button>
            </div>
            {selectedFeatures.filter(f => !DISTINCTIVE_FEATURES_OPTIONS.includes(f)).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedFeatures.filter(f => !DISTINCTIVE_FEATURES_OPTIONS.includes(f)).map(f => (
                  <span key={f} className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Outfit Preferences */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outfit Preferences <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="outfit_preferences" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Colorful dresses, always wears a red cape" />
          </div>

          {/* Upload Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Image <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="image" type="file" accept="image/*" className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 border rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? "Saving…" : "Create Character"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
