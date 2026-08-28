// Built-in invitation templates + helpers for the Studio editor.

const WEDDING_GALLERY = [
  { url: "/media/582bc498b_generated_93fa3ad5.png", alt: "Close up of two gold wedding rings resting on cream linen with olive greenery", span: "tall" },
  { url: "/media/e6853854b_generated_6d708196.png", alt: "Elegant outdoor wedding table setting with candles and florals at dusk", span: "wide" },
  { url: "/media/5856fa2b7_generated_5cd6ad13.png", alt: "Cream invitation paper with copper wax seal on stone surface", span: "wide" },
  { url: "/media/99b0701c8_generated_dae09813.png", alt: "Grand stone venue exterior at golden hour", span: "tall" },
];

const BIRTHDAY_GALLERY = [
  { url: "/media/6d456085b_generated_image.png", alt: "Two champagne glasses clinking in warm candlelight at a birthday celebration", span: "tall" },
  { url: "/media/6b1ca96ed_generated_image.png", alt: "Elegant birthday venue with a long table, soft florals and warm string lights at dusk", span: "wide" },
  { url: "/media/83a13c58f_generated_image.png", alt: "Birthday invitation card with cream paper and a copper seal beside dried lavender", span: "wide" },
  { url: "/media/7c03129e2_generated_image.png", alt: "Elegant dessert table with a layered cake, macarons and cream florals in candlelight", span: "tall" },
];

const GALA_GALLERY = [
  { url: "/media/4a2e3b0f9_generated_image.png", alt: "Crystal chandelier glowing warm gold in a dark ballroom", span: "tall" },
  { url: "/media/8d3cf8045_generated_image.png", alt: "Opulent gala venue with vaulted ceilings, marble columns and candlelit tables", span: "wide" },
  { url: "/media/2bb15fc6c_generated_image.png", alt: "Elegant gala place setting with gold cutlery, ivory linen and a single candle", span: "wide" },
  { url: "/media/7cdf7d3fe_generated_image.png", alt: "Grand staircase in an opulent gala venue with warm golden light and candle glow", span: "tall" },
];

export const TEMPLATES = [
  {
    id: "wedding",
    name: "Wedding",
    tagline: "Editorial · Black Tie",
    accentColor: "#C58A58",
    backgroundColor: "#0A0A0A",
    cover: "/media/a2a00eea3_generated_131f7848.png",
  },
  {
    id: "birthday",
    name: "Birthday",
    tagline: "Celebratory · Candlelit",
    accentColor: "#C98F7A",
    backgroundColor: "#0A0A0A",
    cover: "/media/9ac854455_generated_image.png",
  },
  {
    id: "gala",
    name: "Gala",
    tagline: "Corporate · Champagne",
    accentColor: "#B89968",
    backgroundColor: "#0A0A0A",
    cover: "/media/900c8128a_generated_image.png",
  },
];

// Quick-apply palettes offered by the Studio Style tab. All assume a dark
// canvas — the light "paper" sections, hero overlay and ink text derive
// their contrast from --inv-bg, which the layout treats as near-black.
export const STYLE_PRESETS = [
  { id: "wedding-copper", name: "Copper", accentColor: "#C58A58", backgroundColor: "#0A0A0A", textColor: "#F2F0ED" },
  { id: "birthday-rose", name: "Rosewood", accentColor: "#C98F7A", backgroundColor: "#140D0B", textColor: "#F6EFEA" },
  { id: "gala-champagne", name: "Champagne", accentColor: "#B89968", backgroundColor: "#101010", textColor: "#F4F1E8" },
  { id: "noir-silver", name: "Noir Silver", accentColor: "#B9BDB2", backgroundColor: "#111214", textColor: "#EFF1EA" },
];


const CONTENT = {
  wedding: {
    couple: "John & Jane",
    coupleShort: "J & J",
    eventType: "Wedding",
    date: "2027-06-15T17:00",
    venueName: "The Grand Ballroom",
    venueAddress: "123 Main St, New York, NY",
    mapUrl: "https://maps.google.com/?q=The+Grand+Ballroom+New+York",
    time: "5:00 PM",
    dressCode: "Black Tie Optional",
    story:
      "It began with a glance across a crowded room — two strangers, one shared silence, and the quiet certainty that something had started. Years later, beneath a stone archway at golden hour, we promised to keep choosing each other. This is the moment we invite you to witness.",
    heroImage: "/media/a2a00eea3_generated_131f7848.png",
    storyImage: "/media/acb2ce145_generated_60229421.png",
    gallery: WEDDING_GALLERY,
  },
  birthday: {
    couple: "Eleanor",
    coupleShort: "E·30",
    eventType: "Birthday Soirée",
    date: "2027-09-19T19:30",
    venueName: "The Rooftop Garden",
    venueAddress: "88 Skyline Ave, San Francisco, CA",
    mapUrl: "https://maps.google.com/?q=The+Rooftop+Garden+San+Francisco",
    time: "7:30 PM",
    dressCode: "Cocktail Festive",
    story:
      "Thirty years of laughter, lessons, and the people who made it all worthwhile. Tonight we gather under string lights and candle glow to raise a glass to the next chapter — and to every soul who helped write the first. Come celebrate, come hungry, come ready to dance.",
    heroImage: "/media/9ac854455_generated_image.png",
    storyImage: "/media/815151d2f_generated_image.png",
    gallery: BIRTHDAY_GALLERY,
  },
  gala: {
    couple: "The Hartwell Foundation",
    coupleShort: "H·F",
    eventType: "Annual Gala",
    date: "2027-11-12T20:00",
    venueName: "The Astor Ballroom",
    venueAddress: "45 Park Ave, New York, NY",
    mapUrl: "https://maps.google.com/?q=The+Astor+Ballroom+New+York",
    time: "8:00 PM",
    dressCode: "Black Tie",
    story:
      "Once a year, the city's most generous hearts gather under one gilded roof. An evening of music, conversation and quiet philanthropy — every candle lit, every glass raised, in support of a cause greater than ourselves. We would be honoured by your presence.",
    heroImage: "/media/900c8128a_generated_image.png",
    storyImage: "/media/f00f48add_generated_image.png",
    gallery: GALA_GALLERY,
  },
};

// --- Sections ------------------------------------------------------------------

// Order here is the default page order. The Studio lets users toggle
// visibility, edit labels and reorder; the public renderer walks this list.
export const SECTION_DEFS = [
  { id: "countdown", label: "Countdown", hasHeading: false },
  { id: "story", label: "Our Story", hasHeading: true },
  { id: "details", label: "Details", hasHeading: true },
  { id: "gallery", label: "Gallery", hasHeading: true },
  { id: "rsvp", label: "RSVP", hasHeading: true },
];

const SECTION_IDS = SECTION_DEFS.map((s) => s.id);

/** Built-in copy per section — used when the user hasn't overridden it. */
export const DEFAULT_HEADINGS = {
  story: "How we met.",
  details: "When & where.",
  gallery: "The gallery.",
  rsvp: "Will you join us?",
};

export const SECTION_DEFAULT_EYEBROWS = {
  countdown: "",
  story: "Our Story",
  details: "The Details",
  gallery: "Moments",
  rsvp: "The Guest Ledger",
};

/**
 * Splits a plain string so the trailing word renders italic (the signature
 * momenti look). Punctuation travels with the word; a single word renders
 * fully emphasized.
 */
export function emphasizedHeading(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const match = value.match(/^(.*?)([^\s]+)$/s);
  if (!match || !match[1].trim()) return [null, value];
  return [match[1].replace(/\s+$/, " "), match[2]];
}

function buildDefaultSections() {
  return SECTION_DEFS.map((def) => ({ ...def, visible: true }));
}

// Sanitize a stored sections array: drop malformed/unknown rows, dedupe,
// then append any missing known ids in their canonical spot.
function sanitizeSections(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "");
    if (!SECTION_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label:
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim()
          : SECTION_DEFAULT_EYEBROWS[id],
      visible: row.visible !== false,
    });
  }
  for (const def of SECTION_DEFS) {
    if (!seen.has(def.id)) {
      out.push({ id: def.id, label: SECTION_DEFAULT_EYEBROWS[def.id], visible: true });
    }
  }
  return out;
}
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const isHexColor = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// --- Color engine ---------------------------------------------------------------
//
// Powers per-section styling. Sections declare Optional appearance overrides
// (background / text / accent); anything left blank inherits the invitation's
// global theme. Text never becomes invisible: when only a background is given,
// ink is derived from its luminance (readableInk) rather than assumed.

function hexToRgbChannels(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function channelToHexPart(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** WCAG-style relative luminance (0..1). */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgbChannels(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Picks a readable ink for a given surface. Light panels get near-black,
 * dark panels get warm off-white — unless the caller provides an override.
 */
export function readableInk(bgHex, fallback = "#141414") {
  if (!isHexColor(bgHex)) return fallback;
  return relativeLuminance(bgHex) > 0.4 ? "#141414" : "#F7F4EE";
}

/** Linear-ish blend of two hex colors; t=0 -> a, t=1 -> b. */
export function mixHex(a, b, t) {
  if (!isHexColor(a) || !isHexColor(b)) return a;
  const x = hexToRgbChannels(a);
  const y = hexToRgbChannels(b);
  const k = Math.max(0, Math.min(1, t));
  return (
    "#" +
    channelToHexPart(x.r + (y.r - x.r) * k) +
    channelToHexPart(x.g + (y.g - x.g) * k) +
    channelToHexPart(x.b + (y.b - x.b) * k)
  );
}

// --- Media helpers ------------------------------------------------------------

/** Classify a media URL by extension: "video" | "audio" | "image". */
export function mediaTypeFromUrl(url = "") {
  const u = String(url || "");
  if (/\.(mp4|m4v|webm|mov)(\?.*)?(#.*)?$/i.test(u)) return "video";
  if (/\.(mp3|m4a|aac|wav|ogg|oga|flac)(\?.*)?(#.*)?$/i.test(u)) return "audio";
  return "image";
}
const SECTION_STYLE_KEYS = ["bgColor", "textColor", "accentColor"];

function sanitizeSectionStyles(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of SECTION_IDS) {
    const entry = raw[id];
    if (!entry || typeof entry !== "object") continue;
    const cleaned = {};
    for (const key of SECTION_STYLE_KEYS) {
      if (isHexColor(entry[key])) cleaned[key] = entry[key].toLowerCase();
    }
    if (Object.keys(cleaned).length) out[id] = cleaned;
  }
  return out;
}

// Sections that render on the dark canvas (--inv-bg/--inv-text); everything
// else renders on the light "paper" panel (--inv-paper/--inv-paper-ink).
const DARK_SURFACE_SECTIONS = new Set(["rsvp"]);

/**
 * Resolved appearance for one section. Priority: section override ->
 * invitation-wide theme -> adaptive/built-in default. Text never becomes
 * invisible: when only a background is chosen, ink derives from its
 * luminance (readableInk). Returned `style` holds CSS custom properties to
 * spread on the section wrapper; `hex` exposes the concrete colors (the
 * Story section needs real values for its scroll-gradient interpolation).
 */
export function resolveSectionAppearance(data, id) {
  const override = (data.sectionStyles && data.sectionStyles[id]) || {};
  const theme = data.theme || {};

  if (DARK_SURFACE_SECTIONS.has(id)) {
    const bg = override.bgColor || data.backgroundColor || "#0A0A0A";
    const text =
      override.textColor ||
      (override.bgColor ? readableInk(bg) : "") ||
      (isHexColor(theme.textColor) ? theme.textColor : "") ||
      readableInk(bg);
    const accent = override.accentColor || data.accentColor || "#C58A58";
    return {
      style: { "--inv-bg": bg, "--inv-text": text, "--inv-accent": accent },
      hex: { bg, ink: text, accent, paper: "#F2F0ED" },
    };
  }

  const paper =
    override.bgColor ||
    (isHexColor(theme.paperColor) ? theme.paperColor : "") ||
    "#F2F0ED";
  const ink = override.textColor || readableInk(paper);
  const accent = override.accentColor || data.accentColor || "#C58A58";

  return {
    style: {
      "--inv-paper": paper,
      "--inv-paper-ink": ink,
      "--inv-accent": accent,
    },
    hex: { paper, ink, accent },
  };
}

// Muted background-video loop transition options (hero / story / gallery).
export const LOOP_TRANSITIONS = [
  { id: "cut", label: "None (hard cut)" },
  { id: "fade", label: "Fade" },
  { id: "crossfade", label: "Crossfade" },
];

// Build a fresh, editable invitation object from a template id.

export function templateDefaults(templateId) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const c = CONTENT[t.id];
  return {
    slug: slugify(c.couple),
    title: `${c.couple} · ${t.name}`,
    template: t.id,
    couple: c.couple,
    coupleShort: c.coupleShort,
    eventType: c.eventType,
    date: c.date,
    venueName: c.venueName,
    venueAddress: c.venueAddress,
    mapUrl: c.mapUrl,
    time: c.time,
    dressCode: c.dressCode,
    story: c.story,
    heroImage: c.heroImage,
    heroImageMobile: "",
    storyImage: c.storyImage,
    gallery: c.gallery.map((g) => ({ ...g })),
    accentColor: t.accentColor,
    backgroundColor: t.backgroundColor,
    countdownVisible: true,
    // --- extended customization surface ---
    heroKicker: "",     // "" falls back to eventType on the public page
    heroSubline: "",    // optional line beneath the date
    timeNote: "",       // overrides the Time card body
    dressCodeNote: "",  // overrides the Dress Code card body
    detailsNote: "",    // freeform block under the detail cards
    rsvpNote: "",       // shown under the RSVP heading
    rsvpMaxGuests: "5", // guest-count options run 1..N
    headings: {},       // per-section overrides, "" = built-in copy
    sections: buildDefaultSections(),
    sectionStyles: {}, // per-section {bgColor,textColor,accentColor}, blank = inherit
    music: { url: "", autoplay: true, loop: true },
    loopTransition: "cut",
    theme: { textColor: "#F2F0ED", paperColor: "#F2F0ED", displayFont: "serif" },
  };
}
export function templateName(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  return t ? t.name : "Custom";
}

/**
 * Map a stored Invitation record into the shape the invitation components
 * expect. Tolerates records saved before the extended customization fields
 * existed (legacy migration lives here): missing sections derive from the
 * old top-level countdownVisible flag, colors fall back to built-ins.
 */
export function normalizeInvitation(r) {
  let sections = sanitizeSections(r.sections);
  if (!sections) {
    // Legacy record: visibility existed only for the countdown.
    sections = buildDefaultSections().map((s) =>
      s.id === "countdown" ? { ...s, visible: r.countdownVisible !== false } : s
    );
  }

  const headingsIn = r.headings && typeof r.headings === "object" ? r.headings : {};
  const headings = {};
  for (const def of SECTION_DEFS) {
    if (!def.hasHeading) continue;
    const override =
      typeof headingsIn[def.id] === "string" ? headingsIn[def.id].trim() : "";
    headings[def.id] = override || DEFAULT_HEADINGS[def.id];
  }

  const themeIn = r.theme && typeof r.theme === "object" ? r.theme : {};
  const musicIn = r.music && typeof r.music === "object" ? r.music : {};
  const cleanText = (v) => (typeof v === "string" ? v.trim() : "");

  return {
    slug: r.slug,
    couple: r.couple,
    coupleShort: r.coupleShort,
    eventType: r.eventType,
    date: r.date,
    venue: {
      name: r.venueName,
      address: r.venueAddress,
      mapUrl: r.mapUrl,
    },
    time: r.time,
    dressCode: r.dressCode,
    story: r.story,
    heroImage: r.heroImage,
    // Optional art direction: a dedicated (usually portrait) hero image for
    // small screens. Empty falls back to the main heroImage.
    heroImageMobile: typeof r.heroImageMobile === "string" ? r.heroImageMobile : "",
    storyImage: r.storyImage,
    gallery: Array.isArray(r.gallery) ? r.gallery : [],
    accentColor: isHexColor(r.accentColor) ? r.accentColor : "#C58A58",
    backgroundColor: isHexColor(r.backgroundColor) ? r.backgroundColor : "#0A0A0A",
    // --- extended customization surface ---
    heroKicker: cleanText(r.heroKicker) || cleanText(r.eventType),
    heroSubline: cleanText(r.heroSubline),
    timeNote: cleanText(r.timeNote),
    dressCodeNote: cleanText(r.dressCodeNote),
    detailsNote: cleanText(r.detailsNote),
    rsvpNote: cleanText(r.rsvpNote),
    rsvpMaxGuests: Math.min(Math.max(parseInt(r.rsvpMaxGuests, 10) || 5, 1), 10),
    sections,
    headings,
    music: {
      url: String(musicIn.url || "").trim(),
      autoplay: musicIn.autoplay !== false,
      loop: musicIn.loop !== false,
    },
    loopTransition: LOOP_TRANSITIONS.some((t) => t.id === r.loopTransition)
      ? r.loopTransition
      : "cut",
    sectionStyles: sanitizeSectionStyles(r.sectionStyles),
    theme: {
      textColor: isHexColor(themeIn.textColor) ? themeIn.textColor : "#F2F0ED",
      paperColor: isHexColor(themeIn.paperColor) ? themeIn.paperColor : "#F2F0ED",
      displayFont: themeIn.displayFont === "sans" ? "sans" : "serif",
    },
  };
}
