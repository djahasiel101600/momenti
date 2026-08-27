import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/client";
import { getEvent } from "@/lib/eventData";
import { normalizeInvitation, SECTION_DEFAULT_EYEBROWS, resolveSectionAppearance } from "@/lib/templates";
import Preloader from "@/components/invitation/Preloader";
import InvitationHero from "@/components/invitation/InvitationHero";
import CountdownTimer from "@/components/invitation/CountdownTimer";
import StorySection from "@/components/invitation/StorySection";
import EventDetails from "@/components/invitation/EventDetails";
import Gallery from "@/components/invitation/Gallery";
import RsvpForm from "@/components/invitation/RsvpForm";
import StickyRsvp from "@/components/invitation/StickyRsvp";
import NotFoundState from "@/components/invitation/NotFoundState";

export default function Invitation() {
  const { client } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      let record = null;
      try {
        const res = await base44.entities.Invitation.filter({ slug: client }, "-created_date", 1);
        record = res && res[0] ? res[0] : null;
      } catch (e) {
        record = null;
      }
      if (!alive) return;
      const source = record ? normalizeInvitation(record) : getEvent(client);
      setData(source);
      if (!source) {
        setLoading(false);
        return;
      }
      const t = setTimeout(() => alive && setLoading(false), 2500);
      return () => clearTimeout(t);
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  if (!data) {
    return loading ? (
      <div className="fixed inset-0 inv-bg" />
    ) : (
      <NotFoundState slug={client} />
    );
  }

  // Sections are user-customized: order drives placement, visibility hides
  // whole blocks, and each row's label doubles as the eyebrow copy. Each
  // section also carries its own resolved appearance (background / text /
  // accent overrides scoped to that block only).
  const enabledSections = data.sections.filter((s) => s.visible);
  const labels = Object.fromEntries(
    data.sections.map((s) => [s.id, s.label || SECTION_DEFAULT_EYEBROWS[s.id] || s.id])
  );
  const appearances = Object.fromEntries(
    enabledSections.map((s) => [s.id, resolveSectionAppearance(data, s.id)])
  );
  const rsvpEnabled = enabledSections.some((s) => s.id === "rsvp");

  return (
    <main
      className="bg-[#F2F0ED]"
      data-display-font={data.theme.displayFont}
      style={{
        "--inv-accent": data.accentColor,
        "--inv-bg": data.backgroundColor,
        "--inv-text": data.theme.textColor,
        "--inv-paper": data.theme.paperColor || "#F2F0ED",
      }}
    >
      <AnimatePresence>
        {loading && <Preloader couple={data.couple} />}
      </AnimatePresence>

      <InvitationHero data={data} />

      {enabledSections.map(({ id }) => {
        switch (id) {
          case "countdown":
            return data.date ? (
              <CountdownTimer
                key={id}
                date={data.date}
                appearance={appearances.countdown}
              />
            ) : null;
          case "story":
            return (
              <StorySection
                key={id}
                data={data}
                eyebrow={labels.story}
                heading={data.headings.story}
                appearance={appearances.story}
              />
            );
          case "details":
            return (
              <EventDetails
                key={id}
                data={data}
                eyebrow={labels.details}
                heading={data.headings.details}
                appearance={appearances.details}
              />
            );
          case "gallery":
            return (
              <Gallery
                key={id}
                data={data}
                eyebrow={labels.gallery}
                heading={data.headings.gallery}
                appearance={appearances.gallery}
              />
            );
          case "rsvp":
            return (
              <RsvpForm
                key={id}
                data={data}
                eyebrow={labels.rsvp}
                heading={data.headings.rsvp}
                appearance={appearances.rsvp}
              />
            );
          default:
            return null;
        }
      })}

      {rsvpEnabled && <StickyRsvp />}

      <footer className="inv-bg inv-text-30 py-8 text-center text-[10px] tracking-luxe uppercase">
        momenti.co · {data.couple}
      </footer>
    </main>
  );
}