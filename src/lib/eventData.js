// Mock data layer for momenti.co — keyed by client slug.
// Replace with a database later. For Phase 1 this is the single source of truth.

export const events = {
  "john-doe": {
    slug: "john-doe",
    couple: "John & Jane",
    coupleShort: "J & J",
    eventType: "Wedding",
    date: "2027-06-15T17:00:00Z",
    venue: {
      name: "The Grand Ballroom",
      address: "123 Main St, New York, NY",
      mapUrl: "https://maps.google.com/?q=The+Grand+Ballroom+New+York",
    },
    time: "5:00 PM",
    dressCode: "Black Tie Optional",
    heroImage:
      "/media/a2a00eea3_generated_131f7848.png",
    storyImage:
      "/media/acb2ce145_generated_60229421.png",
    story:
      "It began with a glance across a crowded room — two strangers, one shared silence, and the quiet certainty that something had started. Years later, beneath a stone archway at golden hour, we promised to keep choosing each other. This is the moment we invite you to witness.",
    countdownVisible: true,
    gallery: [
      {
        url: "/media/582bc498b_generated_93fa3ad5.png",
        alt: "Close up of two gold wedding rings resting on cream linen with olive greenery",
        span: "tall",
      },
      {
        url: "/media/e6853854b_generated_6d708196.png",
        alt: "Elegant outdoor wedding table setting with candles and florals at dusk",
        span: "wide",
      },
      {
        url: "/media/5856fa2b7_generated_5cd6ad13.png",
        alt: "Cream invitation paper with copper wax seal on stone surface",
        span: "wide",
      },
      {
        url: "/media/99b0701c8_generated_dae09813.png",
        alt: "Grand stone venue exterior at golden hour",
        span: "tall",
      },
    ],
  },
  "eleanor-30": {
    slug: "eleanor-30",
    couple: "Eleanor",
    coupleShort: "E·30",
    eventType: "Birthday Soirée",
    date: "2027-09-19T19:30:00Z",
    venue: {
      name: "The Rooftop Garden",
      address: "88 Skyline Ave, San Francisco, CA",
      mapUrl: "https://maps.google.com/?q=The+Rooftop+Garden+San+Francisco",
    },
    time: "7:30 PM",
    dressCode: "Cocktail Festive",
    heroImage:
      "/media/9ac854455_generated_image.png",
    storyImage:
      "/media/815151d2f_generated_image.png",
    story:
      "Thirty years of laughter, lessons, and the people who made it all worthwhile. Tonight we gather under string lights and candle glow to raise a glass to the next chapter — and to every soul who helped write the first. Come celebrate, come hungry, come ready to dance.",
    countdownVisible: true,
    gallery: [
      {
        url: "/media/6d456085b_generated_image.png",
        alt: "Two champagne glasses clinking in warm candlelight at a birthday celebration",
        span: "tall",
      },
      {
        url: "/media/6b1ca96ed_generated_image.png",
        alt: "Elegant birthday venue with a long table, soft florals and warm string lights at dusk",
        span: "wide",
      },
      {
        url: "/media/83a13c58f_generated_image.png",
        alt: "Birthday invitation card with cream paper and a copper seal beside dried lavender",
        span: "wide",
      },
      {
        url: "/media/7c03129e2_generated_image.png",
        alt: "Elegant dessert table with a layered cake, macarons and cream florals in candlelight",
        span: "tall",
      },
    ],
  },
};

export function getEvent(slug) {
  return events[slug] || null;
}