"use client";

import Link from "next/link";
import { InteriorHeader } from "@/components/Masthead";
import { PageMarkdownView } from "@/components/PageMarkdownView";

const Star = () => (
  <span aria-hidden className="opacity-70">
    &#9733;
  </span>
);

const ROUTE_GROUPS = [
  {
    title: "Editorial",
    items: [
      { name: "City Desk — Chrome Extension", href: "/a3", page: "/a3" },
      { name: "Composing Room — Viewer", href: "/viewer", page: "/viewer" },
      { name: "Wire Room — CLI", href: "/a5", page: "/a5" },
    ],
  },
  {
    title: "Public Floor",
    items: [
      { name: "Front Page", href: "/", page: "/" },
      { name: "Writing Desk — Desktop App", href: "/a2", page: "/a2" },
      { name: "Syndication Office — Widget", href: "/a4", page: "/a4" },
      { name: "Editor’s Office — Help", href: "/help", page: "/help" },
    ],
  },
  {
    title: "Records (Basement)",
    items: [
      { name: "Privacy Vault", href: "/privacy", page: "/privacy" },
      { name: "Bylaws & Legal", href: "/terms", page: "/terms" },
      { name: "Cookie Tin", href: "/cookies", page: "/cookies" },
      {
        name: "Back Issues — GitHub",
        href: "https://github.com/proticom/paperboy",
        page: "github",
      },
    ],
  },
];

export default function DirectoryPage() {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <InteriorHeader pageLabel="Site Directory" />
      <PageMarkdownView>
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
          {/* Section banner */}
          <div className="border-y-2 border-ink py-1.5 mb-6 flex justify-center items-center gap-3 sm:gap-4 font-body text-[10px] sm:text-[11px] uppercase tracking-[0.3em] flex-wrap">
            <Star />
            <span>Site Directory</span>
            <Star />
            <em className="font-headline italic text-faded normal-case tracking-[0.06em]">
              Architects of the Paperboy Building, drawing no. I
            </em>
            <Star />
          </div>

          {/* Lead */}
          <div className="text-center mb-8">
            <div className="font-mono text-[11px] uppercase tracking-[0.4em] mb-3.5">
              Drawn to Scale &middot; Reviewed by the Editor &middot; Filed in
              Triplicate
            </div>
            <h1
              className="font-headline font-black uppercase leading-[0.9] tracking-tight m-0"
              style={{ fontSize: "clamp(56px, 11vw, 140px)" }}
            >
              Plan of the Premises
            </h1>
            <p
              className="font-headline italic leading-snug max-w-[740px] mx-auto mt-4"
              style={{ fontSize: "clamp(18px, 2vw, 22px)" }}
            >
              A reader&rsquo;s guide to every page on Paperboy.run, organised
              by department. Click any room to enter; the door is always open.
            </p>
            <div className="font-body text-[11px] uppercase tracking-[0.18em] mt-4 border-t border-ink inline-block px-6 pt-2">
              By the Composing Room &middot; The Paperboy Times
            </div>
          </div>

          {/* Floor plan */}
          <FloorPlan today={today} />

          {/* Textual index below */}
          <DirectoryIndex />
        </div>
      </PageMarkdownView>
    </>
  );
}

function FloorPlan({ today }: { today: string }) {
  return (
    <div className="relative max-w-[1200px] mx-auto mb-8 border border-ink p-6 sm:p-7">
      {/* Corner brackets */}
      <span
        aria-hidden
        className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-ink"
      />
      <span
        aria-hidden
        className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-ink"
      />
      <span
        aria-hidden
        className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-ink"
      />
      <span
        aria-hidden
        className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-ink"
      />

      {/* Plate header */}
      <div className="flex justify-between items-center flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.14em] border-b border-ink pb-2 mb-3">
        <div className="flex gap-5 flex-wrap">
          <span className="whitespace-nowrap">Sheet 1 of 1</span>
          <span className="whitespace-nowrap">
            Scale: 1 inch &equiv; 1 click
          </span>
        </div>
        <div className="flex gap-5 flex-wrap">
          <span className="whitespace-nowrap">Plan of the Premises</span>
          <span className="whitespace-nowrap">1 Press Plaza</span>
        </div>
      </div>

      <FloorPlanSVG />

      {/* Plate footer */}
      <div className="flex justify-between items-center flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.18em] border-t border-ink pt-2 mt-3">
        <div className="flex gap-4 flex-wrap">
          <span>Drawn by the Composing Room</span>
          <span>
            Filed:{" "}
            <span suppressHydrationWarning>{today}</span>
          </span>
        </div>
        <div>
          <span>Approved &mdash; The Editor</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Architectural floor plan as inline SVG.
 *
 * Three floors. Each labeled room is wrapped in an <a> so hovering one
 * inverts the rect fill + text fill via the `group / group-hover` pair.
 * Colours use the existing `--color-ink` / `--color-paper` CSS vars so
 * Late Edition (html.late-edition) inverts the whole drawing for free.
 *
 * Coordinates (viewBox 1200 × 980):
 *   Pediment / sign band: y 30..80
 *   Building shell:       60,80 → 1140,860
 *   Top floor:    y  80..340  — 3 rooms (City Desk | Composing | Wire)
 *   Middle floor: y 340..660  — 4 rooms (Writing Desk | Front Page | Editor | Syndication)
 *   Basement:     y 660..860  — 3 rooms (Privacy | Bylaws | Cookie Tin)
 *   Steps + entrance label below.
 */
function FloorPlanSVG() {
  return (
    <svg
      viewBox="0 0 1200 980"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto block"
      role="img"
      aria-labelledby="planTitle planDesc"
    >
      <title id="planTitle">
        Floor plan of The Paperboy Times building
      </title>
      <desc id="planDesc">
        A cutaway architectural drawing showing three floors. Each labeled
        room links to a page on the site.
      </desc>

      {/* Pediment + sign band */}
      <polygon
        points="60,80 600,30 1140,80"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      <text
        x={600}
        y={62}
        textAnchor="middle"
        className="font-masthead fill-ink"
        style={{ fontSize: 22 }}
      >
        The Paperboy Times
      </text>
      <text
        x={600}
        y={76}
        textAnchor="middle"
        className="font-headline italic fill-ink"
        style={{ fontSize: 11, opacity: 0.75 }}
      >
        Est. MMXXVI &middot; 1 Press Plaza &middot; All the Markdown That&rsquo;s Fit
        to Print
      </text>

      {/* Building shell + floor divides */}
      <g fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x={60} y={80} width={1080} height={780} />
        <line x1={60} y1={340} x2={1140} y2={340} />
        <line x1={60} y1={660} x2={1140} y2={660} />
      </g>

      {/* Floor labels (rotated, in left margin) */}
      <g className="fill-ink font-headline italic" style={{ opacity: 0.85 }}>
        <text
          x={44}
          y={215}
          textAnchor="middle"
          transform="rotate(-90, 44, 215)"
          style={{ fontSize: 14 }}
        >
          Editorial
        </text>
        <text
          x={44}
          y={500}
          textAnchor="middle"
          transform="rotate(-90, 44, 500)"
          style={{ fontSize: 14 }}
        >
          Public Floor
        </text>
        <text
          x={44}
          y={760}
          textAnchor="middle"
          transform="rotate(-90, 44, 760)"
          style={{ fontSize: 14 }}
        >
          Records
        </text>
      </g>

      {/* Interior partitions */}
      <g fill="none" stroke="currentColor" strokeWidth={1.5}>
        {/* Top floor */}
        <line x1={420} y1={80} x2={420} y2={340} />
        <line x1={780} y1={80} x2={780} y2={340} />
        {/* Middle floor */}
        <line x1={330} y1={340} x2={330} y2={660} />
        <line x1={630} y1={340} x2={630} y2={660} />
        <line x1={870} y1={340} x2={870} y2={660} />
        {/* Basement */}
        <line x1={420} y1={660} x2={420} y2={860} />
        <line x1={780} y1={660} x2={780} y2={860} />
      </g>

      {/* Windows on outer walls */}
      <g stroke="currentColor" strokeWidth={3} opacity={0.7}>
        {/* Left wall */}
        <line x1={60} y1={130} x2={60} y2={170} />
        <line x1={60} y1={200} x2={60} y2={240} />
        <line x1={60} y1={270} x2={60} y2={310} />
        <line x1={60} y1={380} x2={60} y2={420} />
        <line x1={60} y1={460} x2={60} y2={500} />
        <line x1={60} y1={540} x2={60} y2={580} />
        <line x1={60} y1={620} x2={60} y2={640} />
        {/* Right wall */}
        <line x1={1140} y1={130} x2={1140} y2={170} />
        <line x1={1140} y1={200} x2={1140} y2={240} />
        <line x1={1140} y1={270} x2={1140} y2={310} />
        <line x1={1140} y1={380} x2={1140} y2={420} />
        <line x1={1140} y1={460} x2={1140} y2={500} />
        <line x1={1140} y1={540} x2={1140} y2={580} />
        <line x1={1140} y1={620} x2={1140} y2={640} />
      </g>

      {/* Entrance: steps + label below the building */}
      <g fill="none" stroke="currentColor" strokeWidth={1.5}>
        <line x1={540} y1={880} x2={660} y2={880} />
        <line x1={525} y1={900} x2={675} y2={900} />
        <line x1={510} y1={920} x2={690} y2={920} />
      </g>
      <text
        x={600}
        y={945}
        textAnchor="middle"
        className="fill-ink font-mono uppercase"
        style={{ fontSize: 10, letterSpacing: "0.16em", opacity: 0.7 }}
      >
        &uarr; Front Entrance &middot; Reader Welcome
      </text>

      {/* Compass rose */}
      <g transform="translate(1090, 50)">
        <circle r={18} fill="none" stroke="currentColor" strokeWidth={1} />
        <line x1={0} y1={-22} x2={0} y2={22} stroke="currentColor" strokeWidth={1} />
        <line x1={-22} y1={0} x2={22} y2={0} stroke="currentColor" strokeWidth={1} />
        <polygon points="0,-22 -4,-6 0,-9 4,-6" className="fill-ink" />
        <text
          x={0}
          y={-26}
          textAnchor="middle"
          className="fill-ink font-mono uppercase"
          style={{ fontSize: 9, letterSpacing: "0.16em", opacity: 0.7 }}
        >
          N
        </text>
      </g>

      {/* ─────── ROOMS (clickable) ─────── */}

      {/* Top floor — City Desk */}
      <Room
        href="/a3"
        aria="City Desk — Chrome Extension — /a3"
        x={62}
        y={82}
        w={356}
        h={256}
        tag="Field Bureau"
        name="City Desk"
        path="/a3 · Chrome Extension"
        italic={[
          "Where reporters return with the day’s page,",
          "stripped to clean markdown.",
        ]}
      />

      {/* Top floor — Composing Room */}
      <Room
        href="/viewer"
        aria="Composing Room — Markdown Viewer — /viewer"
        x={422}
        y={82}
        w={356}
        h={256}
        tag="Composition & Layout"
        name="Composing Room"
        path="/viewer · Markdown Viewer"
        italic={[
          "Drop in raw markdown; out comes",
          "a fully laid-out broadsheet.",
        ]}
      />

      {/* Top floor — Wire Room */}
      <Room
        href="/a5"
        aria="Wire Room — Command-line Edition — /a5"
        x={782}
        y={82}
        w={356}
        h={256}
        tag="Telegraph & Wire Service"
        name="Wire Room"
        path="/a5 · paperboy-cli"
        italic={[
          "For the correspondent at the terminal.",
          "Convert one file or crawl a whole site.",
        ]}
      />

      {/* Middle floor — Writing Desk */}
      <Room
        href="/a2"
        aria="Writing Desk — Desktop App — /a2"
        x={62}
        y={342}
        w={268}
        h={316}
        tag="Local-First Editing"
        name="Writing Desk"
        nameSize={22}
        path="/a2"
        italic={["A fast, native editor with", "split-pane preview."]}
        footer="paperboy-app"
      />

      {/* Middle floor — Front Page (centerpiece) */}
      <Room
        href="/"
        aria="Front Page — Home — /"
        x={332}
        y={342}
        w={298}
        h={316}
        tag="Lobby & Reception"
        nameLines={["Front", "Page"]}
        nameSize={38}
        path="/"
        italic={["The morning’s lead, every day."]}
      />

      {/* Middle floor — Editor's Office */}
      <Room
        href="/help"
        aria="Editor’s Office — Help & Ask the Editor — /help"
        x={632}
        y={342}
        w={236}
        h={316}
        tag="Counsel & Corrections"
        nameLines={["Editor’s", "Office"]}
        nameSize={22}
        path="/help"
        italic={[
          "Ask the Editor; counsel,",
          "clarifications, gentle corrections.",
        ]}
      />

      {/* Middle floor — Syndication */}
      <Room
        href="/a4"
        aria="Syndication Office — Web Widget — /a4"
        x={872}
        y={342}
        w={266}
        h={316}
        tag="Distributed via Wire"
        nameLines={["Syndication", "Office"]}
        nameSize={22}
        path="/a4 · Web Widget"
        italic={["One script tag, any site.", "A press in every parlour."]}
      />

      {/* Basement — Privacy Vault */}
      <Room
        href="/privacy"
        aria="Privacy Vault — Privacy Policy — /privacy"
        x={62}
        y={662}
        w={356}
        h={196}
        tag="Strongbox & Confidence"
        name="Privacy Vault"
        nameSize={22}
        path="/privacy"
        italic={["What we collect: nothing."]}
      />

      {/* Basement — Bylaws & Legal */}
      <Room
        href="/terms"
        aria="Bylaws & Legal — Terms of Service — /terms"
        x={422}
        y={662}
        w={356}
        h={196}
        tag="Statutes & Provisions"
        name="Bylaws & Legal"
        nameSize={22}
        path="/terms"
        italic={["Brief, by design."]}
      />

      {/* Basement — Cookie Tin */}
      <Room
        href="/cookies"
        aria="Cookie Tin — Cookie Policy — /cookies"
        x={782}
        y={662}
        w={356}
        h={196}
        tag="Pantry · Essential Only"
        name="Cookie Tin"
        nameSize={22}
        path="/cookies"
        italic={["Edition preference. Nothing else."]}
      />
    </svg>
  );
}

/**
 * One labeled, clickable room. Pure SVG — the parent <a> wraps a <rect> hit
 * target and the room’s text labels. On hover/focus the rect fills with ink
 * and the text inverts to paper.
 *
 * Layout: room contents are stacked top-to-bottom inside the rect:
 *   - tag       (small caps, mono, muted)
 *   - name      (huge headline; either single line `name` or `nameLines`)
 *   - path      (mono, the actual URL)
 *   - italic[]  (one or two lines of italic body copy)
 *   - footer    (optional tiny line at the very bottom)
 */
function Room({
  href,
  aria,
  x,
  y,
  w,
  h,
  tag,
  name,
  nameLines,
  nameSize = 28,
  path,
  italic = [],
  footer,
}: {
  href: string;
  aria: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tag: string;
  name?: string;
  nameLines?: string[];
  nameSize?: number;
  path: string;
  italic?: string[];
  footer?: string;
}) {
  const cx = x + w / 2;

  // Vertical rhythm anchored relative to the room top.
  const tagY = y + 43;
  const nameStartY = y + (nameLines ? 75 : 118);
  const pathY = y + (nameLines ? nameLines.length * (nameSize + 8) + 80 : nameSize + 122);
  const italicStartY = y + h - 50 - (italic.length - 1) * 15;
  const footerY = y + h - 18;

  return (
    <a href={href} aria-label={aria} className="group cursor-pointer">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        className="fill-transparent group-hover:fill-ink group-focus-visible:fill-ink transition-colors duration-100"
      />

      {/* Tag line */}
      <text
        x={cx}
        y={tagY}
        textAnchor="middle"
        className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-mono uppercase"
        style={{ fontSize: 11, letterSpacing: "0.16em", opacity: 0.65 }}
      >
        {tag}
      </text>

      {/* Room name */}
      {nameLines
        ? nameLines.map((line, i) => (
            <text
              key={i}
              x={cx}
              y={nameStartY + i * (nameSize + 8)}
              textAnchor="middle"
              className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-headline font-black uppercase"
              style={{ fontSize: nameSize, letterSpacing: "-0.005em" }}
            >
              {line}
            </text>
          ))
        : name && (
            <text
              x={cx}
              y={nameStartY}
              textAnchor="middle"
              className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-headline font-black uppercase"
              style={{ fontSize: nameSize, letterSpacing: "-0.005em" }}
            >
              {name}
            </text>
          )}

      {/* Path */}
      <text
        x={cx}
        y={pathY}
        textAnchor="middle"
        className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-mono"
        style={{ fontSize: 13, letterSpacing: "0.06em" }}
      >
        {path}
      </text>

      {/* Italic body lines */}
      {italic.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={italicStartY + i * 15}
          textAnchor="middle"
          className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-headline italic"
          style={{ fontSize: 11, opacity: 0.75 }}
        >
          {line}
        </text>
      ))}

      {/* Footer (tiny, very muted) */}
      {footer && (
        <text
          x={cx}
          y={footerY}
          textAnchor="middle"
          className="fill-ink group-hover:fill-paper group-focus-visible:fill-paper transition-colors duration-100 font-headline italic"
          style={{ fontSize: 11, opacity: 0.55 }}
        >
          {footer}
        </text>
      )}
    </a>
  );
}

/**
 * Textual index that sits beneath the floor plan. Always rendered as a
 * fallback for screen readers and quick keyboard scanning. Three columns
 * mirror the three building floors.
 */
function DirectoryIndex() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 border-t-4 border-ink pt-6 mb-12">
      {ROUTE_GROUPS.map((group, groupIdx) => (
        <div
          key={group.title}
          className={`mb-6 ${
            groupIdx < ROUTE_GROUPS.length - 1
              ? "md:border-r md:border-ink md:pr-8 lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(3n)]:pr-0"
              : ""
          }`}
        >
          <h2 className="font-body font-bold text-xs uppercase tracking-[0.18em] border-b-2 border-ink pb-2 mb-3">
            {group.title}
          </h2>
          <ul className="list-none m-0 p-0">
            {group.items.map((item) => (
              <li
                key={item.href}
                className="border-b border-dotted border-ink last:border-b-0 py-1.5 font-body text-[15px] leading-relaxed"
              >
                <Link
                  href={item.href}
                  className="grid items-end no-underline text-ink hover:bg-ink hover:text-paper -mx-1 px-1 transition-colors"
                  style={{ gridTemplateColumns: "auto 1fr auto", gap: 0 }}
                >
                  <span className="min-w-0">{item.name}</span>
                  <span
                    aria-hidden
                    className="overflow-hidden whitespace-nowrap text-faded px-1.5 pb-1 min-w-0"
                    style={{ letterSpacing: "2px" }}
                  >
                    ..............................................................................................................
                  </span>
                  <span
                    className="font-mono text-xs whitespace-nowrap"
                    style={{ letterSpacing: "0.06em" }}
                  >
                    {item.page}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
