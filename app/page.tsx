import Link from "next/link";
import Hero from "./components/Hero";
import DissolveSection from "./components/DissolveSection";
import MaskTextSection from "./components/MaskTextSection";
import DraggableMaskSection from "./components/DraggableMaskSection";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <>
      <nav>
        <div className="site-name">
          <a href="#">Epilepsiforbundet</a>
        </div>
        <div className="menu">
          <Link href="/migrene">Migrene</Link>
        </div>
      </nav>

      <Hero />
      <DissolveSection />
      <MaskTextSection />
      <DraggableMaskSection />
      <Footer />
    </>
  );
}
