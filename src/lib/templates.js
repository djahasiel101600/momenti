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

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    storyImage: c.storyImage,
    gallery: c.gallery.map((g) => ({ ...g })),
    accentColor: t.accentColor,
    backgroundColor: t.backgroundColor,
    countdownVisible: true,
  };
}

export function templateName(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  return t ? t.name : "Custom";
}

// Map a stored Invitation record into the shape the invitation components expect.
export function normalizeInvitation(r) {
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
    storyImage: r.storyImage,
    gallery: Array.isArray(r.gallery) ? r.gallery : [],
    accentColor: r.accentColor || "#C58A58",
    backgroundColor: r.backgroundColor || "#0A0A0A",
    countdownVisible: r.countdownVisible !== false,
  };
}