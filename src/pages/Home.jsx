import Navbar from "@/components/marketing/Navbar";
import Hero from "@/components/marketing/Hero";
import Portfolio from "@/components/marketing/Portfolio";
import Features from "@/components/marketing/Features";
import Footer from "@/components/marketing/Footer";

export default function Home() {
  return (
    <div className="bg-[#0A0A0A]">
      <Navbar />
      <Hero />
      <Portfolio />
      <Features />
      <Footer />
    </div>
  );
}