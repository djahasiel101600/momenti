import { useState } from "react";
import { base44 } from "@/api/client";
import { Loader2, Upload, Music4 } from "lucide-react";

/** Audio picker: upload (auto-streamed when large) or paste any audio URL. */
export default function AudioField({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (err) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2 space-y-3">
        <div className="flex gap-3 items-center">
          <label className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-4 py-2 cursor-pointer hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload audio"}
            <input type="file" accept="audio/*" className="hidden" onChange={handleFile} />
          </label>
          {value && !uploading && (
            <Music4 size={16} className="text-[#F2F0ED]/40" aria-label="Track ready" />
          )}
        </div>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="or paste audio URL"
          className="w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
        />
        {value && (
          <audio key={value} src={value} controls preload="metadata" className="w-full h-9" />
        )}
        {error && <p className="text-[10px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}
