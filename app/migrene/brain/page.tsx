import type { Metadata } from "next";
import BrainStudy from "./BrainStudy";

export const metadata: Metadata = {
  title: "Painted brain — Migrene",
  description: "An interactive watercolor brain study.",
};

export default function BrainPage() {
  return <BrainStudy />;
}
