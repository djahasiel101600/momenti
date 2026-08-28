import { useState } from "react";
import { base44 } from "@/api/client";
import { mediaTypeFromUrl } from "@/lib/templates";
import { Image } from "@/components/ui/image";
import { Loader2, Upload, Images } from "lucide-react";
import MediaLibrary from "./MediaLibrary";

// Accepts images AND videos; the thumbnail previews either kind.
export default function ImageField({ label, value, onChange, accept = "image/*,video/*" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);

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
      e.target.value = ""; // allow re-selecting the same file
    }
  };

  const type = mediaTypeFromUrl(value);

  return (
    <div>
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2 flex gap-3 items-start">
        <div className="w-24 h-24 rounded-sm overflow-hidden bg-white/5 flex-shrink-0">
          {value ? (
            type === "video" ? (
              <video
                src={value}
                className="w-full h-full object-cover"
                muted
                playsInline
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => e.currentTarget.pause()}
              />
            ) : (
              <Image src={value} fittingType="fill" className="w-full h-full" />
            )
          ) : (
            <div className="w-full h-full" />
          )}
        </div>
        <div className="flex-1 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-4 py-2 cursor-pointer hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" accept={accept} className="hidden" onChange={handleFile} />
          </label>
          <button
            type="button"
            onClick={() => setShowLibrary(true)}
            className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-4 py-2 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors"
          >
            <Images size={14} /> Library
          </button>
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or paste image / video URL"
            className="w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
          />
          {type === "video" && value && (
            <span className="inline-block text-[9px] tracking-luxe-sm uppercase px-2 py-1 border border-white/15 text-[#F2F0ED]/50">Video</span>
          )}
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      </div>
      {showLibrary && (
        <MediaLibrary
          open={showLibrary}
          onClose={() => setShowLibrary(false)}
          onSelect={(url) => {
            onChange(url);
            setShowLibrary(false);
          }}
          kinds={["image", "video"]}
        />
      )}
    </div>
  );
}
