import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/client";
import { getEvent } from "@/lib/eventData";
import { normalizeInvitation } from "@/lib/templates";
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

  return (
    <main
      className="bg-[#F2F0ED]"
      style={{ "--inv-accent": data.accentColor, "--inv-bg": data.backgroundColor }}
    >
      <AnimatePresence>
        {loading && <Preloader couple={data.couple} />}
      </AnimatePresence>

      <InvitationHero data={data} />
      {data.countdownVisible && <CountdownTimer date={data.date} />}
      <StorySection data={data} />
      <EventDetails data={data} />
      <Gallery data={data} />
      <RsvpForm data={data} />
      <StickyRsvp />

      <footer className="inv-bg text-[#F2F0ED]/30 py-8 text-center text-[10px] tracking-luxe uppercase">
        momenti.co · {data.couple}
      </footer>
    </main>
  );
}