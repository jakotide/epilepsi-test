"use client";

import { useEffect, useRef, useState } from "react";
import { createExperienceScene, type ExperienceScene } from "./experienceScene";
import styles from "./ExperienceCanvas.module.css";

const studies = [
  { label: "Uskarpt", title: "Når detaljene glir ut", text: "En kopp kaffe. En kjent form. Se hvordan uttrykket endrer seg når konturene blir mykere." },
  { label: "Lyspunkter", title: "Lys mellom trærne", text: "Lys slipper gjennom løvverket. Se hvordan myke lyspunkter endrer rommet mellom trærne." },
  { label: "Lysskjær", title: "Et lysere øyeblikk", text: "Det samme stille motivet, med et varmt lysskjær over papiret." },
  { label: "Slør", title: "Bak et lett slør", text: "Et landskap som trekker seg tilbake i et mykt, lyst slør." },
];

export default function ExperienceCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engine = useRef<ExperienceScene | null>(null);
  const [selected, setSelected] = useState(0);
  const [displayed, setDisplayed] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    try {
      engine.current = createExperienceScene(host, () => { if (alive) setFailed(true); }, index => { if (alive) setDisplayed(index); });
      queueMicrotask(() => { if (alive) setReady(true); });
    } catch {
      queueMicrotask(() => { if (alive) setFailed(true); });
    }
    return () => { alive = false; engine.current?.dispose(); engine.current = null; };
  }, []);

  const select = (index: number) => {
    setSelected(index);
    engine.current?.select(index);
  };
  return (
    <section id="visuelle-uttrykk" className={styles.section} aria-label="Utforsk visuelle uttrykk" data-experience>
      <div className={styles.stage}>
        <div ref={hostRef} className={styles.canvas} role="img" aria-label={displayed % 2 === 0 ? "En elfenbenshvit kopp malt i blågrå akvarell." : "Et lite landskap med trær malt i akvarell."} data-experience-canvas />
        <div className={styles.panel}>
          <div className={styles.copy} aria-live="polite" aria-atomic="true">
            <h2>{studies[displayed].title}</h2>
            <p>{studies[displayed].text}</p>
          </div>
          <div className={styles.choices} role="group" aria-label="Velg et visuelt uttrykk">
            {studies.map((study, index) => (
              <button key={study.label} type="button" aria-pressed={selected === index} disabled={!ready} onClick={() => select(index)}>
                <span className={styles.dot} aria-hidden="true" />
                <span>{study.label}</span>
                <span className={styles.number} aria-hidden="true">0{index + 1}</span>
              </button>
            ))}
          </div>
          <button className={styles.compare} type="button" disabled={!ready} aria-pressed={!enabled} onClick={() => {
            const next = !enabled;
            setEnabled(next);
            engine.current?.setEffect(next);
          }}>
            {enabled ? "Vis uten effekt" : "Vis med effekt"}
            <span aria-hidden="true">{enabled ? "−" : "+"}</span>
          </button>
          {failed && <p className={styles.error} role="status">Visningen kunne ikke åpnes i denne nettleseren.</p>}
        </div>
      </div>
    </section>
  );
}
