import Hero from "./components/Hero";
import DissolveSection from "./components/DissolveSection";
import MaskTextSection from "./components/MaskTextSection";

export default function Home() {
  return (
    <>
      <nav>
        <div className="site-name">
          <a href="#">Epilepsiforbundet</a>
        </div>
      </nav>

      <Hero />
      <DissolveSection />
      <MaskTextSection />
    </>
  );
}
