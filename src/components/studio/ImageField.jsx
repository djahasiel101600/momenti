import { useState } from "react";
import { base44 } from "@/api/client";
import { Image } from "@/components/ui/image";
import { Loader2, Upload } from "lucide-react";

export default function ImageField({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (err) {
      // ignore — user can paste a URL instead
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2 flex gap-3 items-start">
        <div className="w-24 h-24 rounded-sm overflow-hidden bg-white/5 flex-shrink-0">
          {value ? (
            <Image src={value} fittingType="fill" className="w-full h-full" />
          ) : (
            <div className="w-full h-full" />
          )}
        </div>
        <div className="flex-1 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-4 py-2 cursor-pointer hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or paste image URL"
            className="w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
          />
        </div>
      </div>
    </div>
  );
}