"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <Link href="/page-two" className="footer__btn">
        Fortsett
      </Link>
    </footer>
  );
}
