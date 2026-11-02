"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/store";

const LEGAL: Record<
  string,
  { title: string; body: React.ReactNode }
> = {
  disclaimer: {
    title: "Disclaimer",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <p>
          Cineora is a demonstration streaming platform. Discovery, metadata and artwork are
          powered by The Movie Database (TMDB). Full-length playback is only offered for films
          that are in the public domain or published under an open license (such as Creative
          Commons), streamed directly from the Internet Archive.
        </p>
        <p>
          For all other titles Cineora plays official trailers and clips hosted on YouTube —
          it does not host or link to unauthorized copies of copyrighted films or series.
        </p>
        <p>
          If you believe any material streams here improperly, contact the operator using the
          DMCA procedure and it will be removed promptly.
        </p>
      </div>
    ),
  },
  dmca: {
    title: "DMCA Notice & Takedown Policy",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <p>
          Cineora respects intellectual property rights. The platform only streams public-domain
          and openly licensed works hosted by the Internet Archive, plus official YouTube
          trailers, so we do not expect takedown requests — but we take any valid notice
          seriously.
        </p>
        <p>A proper DMCA notification should include:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Identification of the work claimed to be infringed.</li>
          <li>The URL or title on Cineora you believe is problematic.</li>
          <li>Your contact information (address, phone, email).</li>
          <li>A good-faith statement that the use is unauthorized.</li>
          <li>A statement, under penalty of perjury, that the information is accurate and you are the rights holder or authorized to act for them.</li>
          <li>Your physical or electronic signature.</li>
        </ul>
        <p>
          Send notices to the operator&apos;s designated agent. Valid notices result in removal
          or disabling of access within a reasonable time, and the affected party may file a
          counter-notice.
        </p>
      </div>
    ),
  },
  terms: {
    title: "Terms of Use",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <p>
          By using Cineora you agree to these terms. The service is provided &ldquo;as is&rdquo;
          for personal, non-commercial viewing of public-domain and openly licensed content, and
          for discovering movies and shows via TMDB metadata.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>You must not attempt to overload, reverse-engineer or disrupt the service.</li>
          <li>Availability of streams depends on third-party archive servers and may vary.</li>
          <li>Your watchlist and viewing history are stored locally in your browser; clearing site data removes them.</li>
          <li>Sign-in on this demo stores only a display name in a first-party cookie.</li>
          <li>The service may be modified or discontinued at any time without notice.</li>
        </ul>
        <p>
          To the maximum extent permitted by law, Cineora disclaims liability for any damages
          arising from use of the service.
        </p>
      </div>
    ),
  },
  privacy: {
    title: "Privacy Policy",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <p>
          Cineora is designed to be privacy-friendly by default. We do not run advertising, we do
          not sell data, and we do not use third-party analytics.
        </p>
        <p>Data handling in brief:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Local storage:</strong> your watchlist and playback positions live in your
            browser and never leave your device.
          </li>
          <li>
            <strong>Session cookie:</strong> signing in sets one first-party, httpOnly cookie
            containing the display name you chose.
          </li>
          <li>
            <strong>Video playback:</strong> full movies are fetched directly from the Internet
            Archive; trailers play via the YouTube player. Their standard logging applies to
            those requests. Metadata and images are served by TMDB.
          </li>
        </ul>
        <p>
          To erase everything Cineora stores about you, sign out and clear your browser storage
          for this site.
        </p>
      </div>
    ),
  },
  cookies: {
    title: "Cookie Policy",
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
        <p>Cineora uses the minimum number of cookies needed to function:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>cineora_session</strong> — an httpOnly cookie created only when you sign in,
            storing your display name for 30 days. Deleting it signs you out.
          </li>
        </ul>
        <p>
          That is the only cookie the site sets. Watchlists and playback progress use
          localStorage, not cookies, and remain entirely on your device.
        </p>
      </div>
    ),
  },
};

export function LegalModals() {
  const legalModal = useStore((s) => s.legalModal);
  const setLegalModal = useStore((s) => s.setLegalModal);

  const current = legalModal ? LEGAL[legalModal] : null;

  return (
    <Dialog open={Boolean(current)} onOpenChange={(open) => !open && setLegalModal(null)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-white/10 bg-popover sm:max-w-lg">
        {current ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">{current.title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Last updated: October 2025
              </DialogDescription>
            </DialogHeader>
            {current.body}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function Footer() {
  const setLegalModal = useStore((s) => s.setLegalModal);
  const navigate = useStore((s) => s.navigate);
  const setAuthOpen = useStore((s) => s.setAuthOpen);

  const linkCls =
    "text-left text-xs text-muted-foreground transition-colors hover:text-foreground";

  return (
    <footer className="mt-auto border-t border-white/5 bg-black/40 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-black text-white">
                C
              </span>
              <span className="text-base font-black tracking-[0.18em] text-foreground">
                CINEORA
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Discover and stream movies &amp; TV shows. Metadata and artwork by TMDB; full-length
              playback for public-domain and open-licensed films via the Internet Archive, plus
              official trailers on YouTube.
            </p>
          </div>

          <nav aria-label="Browse">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground/70">
              Browse
            </p>
            <div className="grid gap-2">
              <button className={linkCls} onClick={() => navigate({ name: "home" })}>
                Home
              </button>
              <button className={linkCls} onClick={() => navigate({ name: "browse", kind: "movie" })}>
                Movies
              </button>
              <button className={linkCls} onClick={() => navigate({ name: "browse", kind: "tv" })}>
                TV Shows
              </button>
              <button className={linkCls} onClick={() => navigate({ name: "mylist" })}>
                My List
              </button>
            </div>
          </nav>

          <nav aria-label="Legal">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground/70">
              Legal
            </p>
            <div className="grid gap-2">
              <button className={linkCls} onClick={() => setLegalModal("disclaimer")}>
                Disclaimer
              </button>
              <button className={linkCls} onClick={() => setLegalModal("dmca")}>
                DMCA
              </button>
              <button className={linkCls} onClick={() => setLegalModal("terms")}>
                Terms of Use
              </button>
              <button className={linkCls} onClick={() => setLegalModal("privacy")}>
                Privacy Policy
              </button>
              <button className={linkCls} onClick={() => setLegalModal("cookies")}>
                Cookie Policy
              </button>
            </div>
          </nav>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground/70">
              Account
            </p>
            <div className="grid gap-2">
              <button
                className={linkCls}
                onClick={() => setAuthOpen(true)}
              >
                Sign In
              </button>
              <button className={linkCls} onClick={() => navigate({ name: "search", query: "" })}>
                Advanced Search
              </button>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
              This product uses the TMDB API but is not endorsed or certified by TMDB. Content
              sources: Internet Archive (archive.org), Blender Foundation open movies, and
              pre-1929 public domain cinema.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/5 pt-6 text-[11px] text-muted-foreground/70 sm:flex-row">
          <p>© 2026 Cineora — a demo streaming experience. Discover freely, watch legally.</p>
          <p>Powered by TMDB · Public domain &amp; Creative Commons full movies</p>
        </div>
      </div>
    </footer>
  );
}
