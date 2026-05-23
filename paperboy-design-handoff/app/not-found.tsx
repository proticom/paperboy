"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InteriorHeader } from "@/components/Masthead";
import { PageMarkdownView } from "@/components/PageMarkdownView";
import { useSiteUi } from "@/components/SiteUiContext";

const Star = () => (
  <span aria-hidden className="opacity-70">
    &#9733;
  </span>
);

const ALSO_IN_TODAY = [
  {
    href: "/a2",
    title: "Desktop Editor",
    blurb: "A fast, local writing desk. Native dialogs, split preview.",
  },
  {
    href: "/a3",
    title: "Chrome Side Panel",
    blurb: "Strips any page to markdown. Quiet, polite, fast.",
  },
  {
    href: "/a4",
    title: "Web Widget",
    blurb: "One script tag. Web-to-markdown toggle. Drop-in ready.",
  },
  {
    href: "/a5",
    title: "Command Line",
    blurb: "Convert files. Crawl sites. For the terminal correspondent.",
  },
  {
    href: "/viewer",
    title: "Markdown Viewer",
    blurb: "Drop a file. See it laid out as a broadsheet.",
  },
];

export default function NotFound() {
  const pathname = usePathname();
  const { setAskEditorOpen } = useSiteUi();
  const lostPath = pathname || "/the-missing-page";

  return (
    <>
      <InteriorHeader pageLabel="Page Not Found" />
      <PageMarkdownView>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          {/* Section banner */}
          <div className="border-y-2 border-ink py-1.5 mb-6 flex justify-center items-center gap-3 sm:gap-4 font-body text-[10px] sm:text-[11px] uppercase tracking-[0.3em] flex-wrap">
            <Star />
            <span>Dead Letter Office</span>
            <Star />
            <em className="font-headline italic text-faded normal-case tracking-[0.06em]">
              Cable received from the wire, this morning
            </em>
            <Star />
          </div>

          {/* Lead */}
          <div className="text-center border-b-4 border-ink pb-5 mb-7">
            <div className="font-mono text-[11px] uppercase tracking-[0.4em] mb-3.5">
              Page Not Found &middot; Error No. 404
            </div>
            <h1
              className="font-headline font-black uppercase leading-[0.9] tracking-tight m-0"
              style={{ fontSize: "clamp(64px, 16vw, 180px)" }}
            >
              Return to Sender
            </h1>
            <p
              className="font-headline italic leading-snug max-w-[720px] mx-auto mt-4"
              style={{ fontSize: "clamp(18px, 2.2vw, 26px)" }}
            >
              The page you requested could not be delivered. Marked{" "}
              <strong>UNDELIVERABLE</strong> and returned to the editorial
              offices, pending further instructions.
            </p>
            <div className="font-body text-[11px] uppercase tracking-[0.18em] mt-4 border-t border-ink inline-block px-6 pt-2">
              By the Editorial Board &middot; The Paperboy Times
            </div>
          </div>

          {/* Three-column body */}
          <main className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left col: Telegram + envelope markings */}
            <aside className="md:col-span-3 md:border-r md:border-ink md:pr-4 flex flex-col gap-6">
              <div className="border-2 border-ink p-4 font-mono text-xs leading-[1.6]">
                <div className="flex justify-between items-baseline border-b border-ink pb-2 mb-3 font-body text-[11px] uppercase tracking-[0.18em]">
                  <span>Western Union</span>
                  <span>404 / Undeliv</span>
                </div>
                <div className="tracking-[0.06em] leading-relaxed">
                  URL UNDELIVERABLE <span className="font-bold">STOP</span>{" "}
                  ADDRESS NOT IN THIS ROUTE{" "}
                  <span className="font-bold">STOP</span> RETURNED TO EDITOR{" "}
                  <span className="font-bold">STOP</span> KINDLY ADVISE READER
                  TO TRY A DIFFERENT PATH{" "}
                  <span className="font-bold">STOP</span> AWAITING FURTHER
                  INSTRUCTION <span className="font-bold">END</span>
                </div>
              </div>

              <div className="border border-ink p-4">
                <h2 className="font-body font-bold text-xs uppercase tracking-[0.18em] border-b-2 border-ink pb-2 mb-3">
                  Markings on the Envelope
                </h2>
                <dl className="flex flex-col gap-3 text-sm font-body">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.18em] text-faded mb-0.5">
                      Addressed to
                    </dt>
                    <dd className="font-mono text-xs break-all">{lostPath}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.18em] text-faded mb-0.5">
                      Postmark
                    </dt>
                    <dd>Dead Letter Office &middot; Paperboy.run</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.18em] text-faded mb-0.5">
                      Reason returned
                    </dt>
                    <dd>No such page at this URL.</dd>
                  </div>
                </dl>
              </div>
            </aside>

            {/* Middle col: editorial */}
            <section className="md:col-span-6 md:border-r md:border-ink md:pr-4">
              <div className="font-body text-base leading-[1.65] text-justify hyphens-auto">
                <p className="drop-cap">
                  Some letters never arrive. They are addressed in haste,
                  dropped into the slot, and sent on their way &mdash; only to
                  bounce between sorting offices, accumulating postmarks, until
                  at last they are returned to the sender with a small grey
                  stamp: <strong>UNDELIVERABLE</strong>.
                </p>
                <p className="mt-4">
                  So it is with the URL you have requested. The address{" "}
                  <code className="font-mono text-[0.85em] px-1 border border-ink bg-ink/5">
                    {lostPath}
                  </code>{" "}
                  has been routed through every desk in the Paperboy newsroom.
                  Each desk shrugged. Each desk passed it along. Eventually the
                  envelope landed, fittingly, in the Dead Letter Office &mdash;
                  the small dim room where we keep the addresses that
                  correspond to nothing at all.
                </p>
                <p className="mt-4">
                  We have, with some ceremony, returned the request to you. The
                  Front Page remains the safest harbour; from there, every
                  section is no more than a click away, and no letter goes
                  astray.
                </p>
                <p className="mt-4 font-bold italic border-t border-ink pt-2">
                  <Link
                    href="/"
                    className="underline decoration-1 underline-offset-4 hover:bg-ink hover:text-paper transition-colors"
                  >
                    Return to the Front Page &raquo;
                  </Link>
                </p>
              </div>

              {/* CTAs */}
              <div className="flex gap-3 flex-wrap mt-6">
                <Link
                  href="/"
                  className="flex-1 min-w-[200px] text-center bg-ink text-paper py-4 px-5 font-body font-bold text-[13px] uppercase tracking-[0.22em] border-2 border-ink hover:bg-transparent hover:text-ink transition-colors"
                >
                  Return to Front Page
                </Link>
                <button
                  type="button"
                  onClick={() => setAskEditorOpen(true)}
                  className="flex-1 min-w-[200px] text-center bg-transparent text-ink py-4 px-5 font-body font-bold text-[13px] uppercase tracking-[0.22em] border-2 border-ink hover:bg-ink hover:text-paper transition-colors cursor-pointer"
                >
                  Cable the Editor
                </button>
              </div>
            </section>

            {/* Right col: also in today's times */}
            <aside className="md:col-span-3 flex flex-col gap-6">
              <div className="border border-ink p-4">
                <h2 className="font-body font-bold text-xs uppercase tracking-[0.18em] border-b-2 border-ink pb-2 mb-3">
                  Also in Today&rsquo;s Times
                </h2>
                <ul className="font-body">
                  {ALSO_IN_TODAY.map((item) => (
                    <li
                      key={item.href}
                      className="border-b border-ink last:border-b-0 py-2.5"
                    >
                      <Link
                        href={item.href}
                        className="block hover:bg-ink hover:text-paper -mx-1 px-1 transition-colors"
                      >
                        <div className="font-headline font-black uppercase text-lg leading-tight mb-0.5">
                          {item.title}
                        </div>
                        <div className="text-[13px] leading-snug">
                          {item.blurb}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </main>
        </div>
      </PageMarkdownView>
    </>
  );
}
