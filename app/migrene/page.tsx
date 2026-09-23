import type { Metadata } from "next";
import MigreneHero from "./MigreneHero";

export const metadata: Metadata = {
  title: "Migrene",
  description: "Livet mellom anfallene. Et nærmere blikk på å leve med migrene.",
};

export default function Migrene() {
  return <MigreneHero />;
}
