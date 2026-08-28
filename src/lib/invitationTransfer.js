// Import/export of invitation designs as shareable JSON files.
//
// The envelope wraps the invitation's flat payload (the same shape the editor
// and the API exchange) with format/version markers so imports can evolve
// safely. Media references (hero, gallery, music) are exported as-is: the
// built-in /media/ assets resolve on any momenti instance, while uploaded
// /uploads/ files are instance-local and need re-uploading when a design is
// shared across installations.
import { slugify } from "./templates.js";

const RESERVED_FIELDS = ["id", "owner_email", "created_date", "updated_date"];
const EXPORT_FORMAT = "momenti.invitation";
const EXPORT_VERSION = 1;

/** Trigger a browser file download for the given blob. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stripIdentityFields(record) {
  const payload = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (!RESERVED_FIELDS.includes(key)) payload[key] = value;
  }
  return payload;
}

/**
 * Serialize a stored invitation (the flat API record) into a shareable
 * `.json` template. Identity fields (id/owner/timestamps) are stripped —
 * importing always creates a fresh invitation owned by the importer.
 * Pure: returns `{ filename, blob }`; pair with downloadBlob() in the UI.
 */
export function buildInvitationExport(record) {
  const envelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    invitation: stripIdentityFields(record),
  };
  const safeName =
    String(record?.slug || record?.couple || "template")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "template";
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  return { filename: `momenti-${safeName}.json`, blob };
}

/**
 * Same export, driven by the editor's form state (used by the publish
 * sidebar). The date is converted back to ISO so the round-trip through
 * toLocalInput() keeps the host's wall-clock time. Pure — pair with
 * downloadBlob().
 */
export function exportInvitationForm(form) {
  return buildInvitationExport({
    ...form,
    date: form?.date ? new Date(form.date).toISOString() : "",
  });
}

/** Browser convenience: build + trigger the download (Studio card action). */
export function exportInvitation(record) {
  const { filename, blob } = buildInvitationExport(record);
  downloadBlob(filename, blob);
}

/**
 * Parse an export file (or a bare invitation object) into a payload for the
 * editor. The slug is normalized and made unique against the studio's
 * existing invitations so saving never collides with a live page.
 */
export function parseInvitationImport(text, existingSlugs = []) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("This file doesn't contain an invitation.");
  }
  if (data.format && data.format !== EXPORT_FORMAT) {
    throw new Error(`Unsupported export format: ${data.format}`);
  }
  if (data.version && Number(data.version) > EXPORT_VERSION) {
    throw new Error("This export was made by a newer version of momenti.");
  }
  const source =
    data.invitation && typeof data.invitation === "object" ? data.invitation : data;
  if (!source.couple && !source.slug && !Array.isArray(source.sections)) {
    throw new Error("This file doesn't look like a momenti invitation export.");
  }

  const payload = stripIdentityFields(source);

  const base = slugify(payload.slug || payload.couple || "imported") || "imported";
  const taken = new Set(existingSlugs.map((s) => String(s || "").toLowerCase()));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = n === 2 ? `${base}-copy` : `${base}-copy-${n - 1}`;
    n += 1;
  }
  payload.slug = slug;
  return payload;
}
