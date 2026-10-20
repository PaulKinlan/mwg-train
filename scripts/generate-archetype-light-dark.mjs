#!/usr/bin/env node
/**
 * Multimodal reference-conditioned generator for consistent Light Mode & Dark Mode
 * concept board sets for the configured archetypes in /concepts.
 * Browser-puzzle-game is deliberately blocked: its seven imported boards have no retained
 * model response or generation prompt, and must not be silently copied from scratch files.
 * Interactive-product-configurator is blocked too: its only Step 1 board predates the pinned
 * step names and every Dark prompt preserves the attached image's labels, so a run would copy
 * the pinned-against labels forward instead of drawing them (mwg-train-601b review).
 *
 * For every configured archetype:
 *   - Light Mode set: docs/design/archetypes/<id>/<stepId>.jpg
 *   - Dark Mode set:  docs/design/archetypes/<id>/dark/<stepId>.jpg
 *
 * Every Step 2..N Light board is generated with Step 1 Light (inlineData image/jpeg) +
 * design.md in context so the header, navigation, typography, palette, and component
 * geometry remain locked across the entire journey.
 * Every Step 1..N Dark board is generated with its corresponding Light Mode step AND
 * Step 1 Dark (inlineData image/jpeg) + design.md in context so Light and Dark sets
 * are 1-to-1 twins with zero intermixing.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hasBrowserChrome } from './check-archetype-frames.mjs';
import { extractPrompts } from './generate-archetype-boards.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = process.env.MWG_TRAIN_IMAGE_ENDPOINT
  || `https://gemini.int.exe.xyz/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 180_000;

const ANTI_CHROME_RULES = [
  'Render ONLY a full-bleed, edge-to-edge WEB PAGE canvas at 1376×768 (16:9).',
  'NO browser chrome, NO macOS traffic lights, NO window frame, NO tab bar, NO address bar, NO exterior drop shadow, NO OS desktop or device mockup.',
  'Do NOT draw OS window minimize/maximize/close (- □ ×) icons on any <dialog> or modal card; use only a clean in-page Close button.',
  'Do NOT print the resolution "1376x768" or raw hex codes as visible text labels on the page.',
  'The web page background colour must extend edge-to-edge to all four borders of the 1376×768 image.',
].join(' ');

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    if (bytes[offset + 1] === 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    offset += 2 + length;
  }
  return null;
}

async function generateMultimodal({ images = [], prompt, retries = 3 }) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const parts = [
      ...images.map((buf) => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: buf.toString('base64'),
        },
      })),
      {
        text: attempt === 1
          ? prompt
          : `${prompt}\n\nCRITICAL RETRY INSTRUCTION: Ensure there are NO red/yellow/green dots or window controls anywhere near the top-left corner, and ensure the page background reaches all four image edges.`,
      },
    ];
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.4,
        maxOutputTokens: 8192,
        imageConfig: { aspectRatio: '16:9' },
      },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 240);
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const payload = await res.json();
      if (payload.modelVersion !== MODEL) {
        throw new Error(`attested model ${payload.modelVersion} !== ${MODEL}`);
      }
      const candidate = payload?.candidates?.[0];
      const part = (candidate?.content?.parts ?? []).find((p) => (p.inlineData ?? p.inline_data)?.data);
      if (!part) throw new Error(`no image part (finishReason: ${candidate?.finishReason})`);
      const inline = part.inlineData ?? part.inline_data;
      const bytes = Buffer.from(inline.data, 'base64');
      const dims = jpegDimensions(bytes);
      if (!dims || dims.width !== 1376 || dims.height !== 768) {
        throw new Error(`unexpected dimensions ${dims ? `${dims.width}x${dims.height}` : 'unknown'}`);
      }
      if (hasBrowserChrome(bytes)) {
        throw new Error('detected browser chrome / macOS traffic lights in generated image');
      }
      return bytes;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  [retry ${attempt}/${retries}] ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('exhausted retries');
}

/**
 * Per-archetype configuration:
 *   anchorMode:
 *     - 'single-light': existing <step>.jpg is clean Light Mode; only generate dark/<step>.jpg
 *     - 'light-anchor': existing step1 is clean Light Mode; generate steps 2..N Light, then steps 1..N Dark
 *     - 'dark-anchor':  existing step1 is clean Dark Mode; copy to dark/step1, generate step1 Light, then steps 2..N Light & Dark
 *     - 'reanchor-light': regenerate step1 Light first, then steps 2..N Light & steps 1..N Dark
 *     - 'reanchor-dark':  regenerate dark/step1 first, then step1 Light, then steps 2..N Light & Dark
 *     - 'fresh-light':  no existing boards; generate step1 Light conditioned on referenceBoard, step1 Dark, then steps 2..N Light & Dark
 *
 * Exported so test/interactive-product-configurator-prompts.test.mjs can assert the pinned step-name labels on the
 * override prose that regenerates the committed Light/Dark sets: reading this file as text would check a copy, not
 * the strings that are actually sent.
 */
export const ARCHETYPE_CONFIGS = {
  // --- 6 Fresh-Light Multi-Step Archetypes (Wave 1) ---
  'onboarding-auth': {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-05/reference.jpg',
    steps: ['step1-register.jpg', 'step2-profile.jpg', 'step3-login.jpg', 'step4-reset.jpg'],
    lightTheme: 'CRISP BOTANICAL DAYLIGHT LIGHT MODE (#f0fdf4 pale botanical light green page background reaching all four image edges, #ffffff card surfaces with 1px #cbd5e1 hairline borders, #0f172a deep slate ink typography, #14532d dark forest-green primary CTA button)',
    darkTheme: 'NOCTURNAL BOTANICAL SANCTUARY DARK MODE (#061a0f deep sanctuary moss-black ground reaching all four image edges, #0e2e1c elevated card surfaces with 1px #1d5232 borders, #f0fdf4 crisp pale-mint typography, #86efac luminous mint-green primary CTA button, #f87171 crimson validation alert)',
  },
  'course-enrolment': {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-09/reference.jpg',
    steps: ['step1-catalog.jpg', 'step2-syllabus.jpg', 'step3-enrol.jpg', 'step4-voucher.jpg'],
    lightTheme: 'CRISP BOTANICAL DAYLIGHT LIGHT MODE (#f0fdf4 pale natural green paper background reaching all four image edges, #ffffff card surfaces with 1px #bbf7d0 mint-leaf borders, #14532d dark moss ink typography, #14532d deep moss-green primary buttons)',
    darkTheme: 'FOREST CANOPY NOCTURNE DARK MODE (#07170e deep forest-black ground reaching all four image edges, #0f2b1a elevated card surfaces with 1px #1c5233 borders, #ecfdf5 crisp pale-mint typography, #4ade80 luminous forest-emerald primary buttons, #f87171 crimson validation alert)',
  },
  dashboard: {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-04/reference.jpg',
    steps: ['step1-overview.jpg', 'step2-telemetry.jpg', 'step3-credits.jpg', 'step4-log.jpg'],
    lightTheme: 'SOLAR DAYLIGHT PAPER LIGHT MODE (#f8fafc cool daylight sky page ground reaching all four image edges, #ffffff telemetry and meter cards with 1px #e2e8f0 borders, #0f172a deep navy-slate ink typography, #0284c7 solar-sky primary buttons, #facc15 amber status accents)',
    darkTheme: 'MIDNIGHT SOLAR ARRAY DARK MODE (#080e1a deep nocturnal grid-slate ground reaching all four image edges, #0f192c telemetry and meter card surfaces with 1px #1e2f4f borders, #f8fafc crisp off-white typography, #38bdf8 sky-cyan telemetry accents, #fbbf24 luminous solar-amber primary buttons)',
  },
  'directory-listing': {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-06/reference.jpg',
    steps: ['step1-directory.jpg', 'step2-artisan.jpg', 'step3-inquiry.jpg', 'step4-empty.jpg'],
    lightTheme: 'EDITORIAL PARCHMENT LIGHT MODE (#fdfbf7 warm parchment paper background reaching all four image edges, #f5f5f4 tactile stone card surfaces with 1px #e7e5e4 borders, #292524 deep charcoal ink typography, #451a03 deep roasted-bark primary buttons, #b45309 copper secondary accents)',
    darkTheme: 'ATELIER WORKSHOP OAK DARK MODE (#151210 deep artisan workshop timber ground reaching all four image edges, #221c17 elevated directory cards and profile surfaces with 1px #3b3028 borders, #faf5f0 warm cotton typography, #ea580c warm terracotta-copper primary buttons, #f87171 crimson validation alert)',
  },
  'docs-site': {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-13/reference.jpg',
    steps: ['step1-guide.jpg', 'step2-registry.jpg', 'step3-submit.jpg', 'step4-empty.jpg'],
    lightTheme: 'CLEAN EDITORIAL EARTH LIGHT MODE (#ffffff crisp clean white page ground reaching all four image edges, #f8fafc left docs navigation rail, #ffffff main content and protocol card surfaces with 1px #e2e8f0 hairline borders, #292524 deep graphite-ink typography, #3b251a rich loam-brown primary action buttons, #15803d leaf-green status badges)',
    darkTheme: 'FIELD NOTEBOOK OBSIDIAN DARK MODE (#0f1115 nocturnal field notebook obsidian ground reaching all four image edges, #161a22 left docs navigation rail, #1b202a main content and protocol card surfaces with 1px #28303f hairline borders, #f8fafc crisp ivory-white typography, #d97706 warm amber-gold primary action buttons, #22c55e emerald status badges, #f87171 crimson validation alert)',
  },
  'support-helpdesk': {
    anchorMode: 'fresh-light',
    referenceBoard: 'docs/design/training/tr-28/reference.jpg',
    steps: ['step1-tickets.jpg', 'step2-submit.jpg', 'step3-ticket.jpg', 'step4-empty.jpg'],
    lightTheme: 'EXPEDITION DAYLIGHT LIGHT MODE (#f8fafc crisp light grey page ground reaching all four image edges, #ffffff card surfaces with 1px #e2e8f0 borders, #0f172a deep slate ink typography, #0284c7 bright trail-blue primary action buttons, #16a34a verified green badge, #e11d48 crimson validation alert)',
    darkTheme: 'ALPINE BASECAMP OBSIDIAN DARK MODE (#0b111a deep nocturnal basecamp slate ground reaching all four image edges, #162030 elevated ticket and repair form card surfaces with 1px #2a3c54 borders, #f8fafc crisp off-white typography, #38bdf8 luminous trail-cyan primary action buttons, #4ade80 verified green badge, #f87171 high-contrast crimson validation alert)',
  },
  // --- 7 Expanded Multi-Step Archetypes (Wave 2) ---
  'community-forum': {
    anchorMode: 'expand-set',
    anchorStep: 'step3-refusal.jpg',
    steps: ['step1-browse.jpg', 'step2-thread.jpg', 'step3-refusal.jpg', 'step4-empty.jpg'],
    lightTheme: 'WARM SONGBOOK PARCHMENT LIGHT MODE (#fefce8 aged songbook parchment page background reaching all four image edges, #ffffff note card surfaces with 1px #fde68a luthiery-amber borders, #450a0a deep mahogany ink text, #b45309 warm brass-amber primary action button)',
    darkTheme: 'EVENING SESSION MAHOGANY DARK MODE (#18110e deep acoustic-mahogany page ground reaching all four image edges, #261b16 elevated note card surfaces with 1px #3f2e26 warm walnut borders, #faf5f0 warm cream typography, #f59e0b warm brass-amber primary button, #f87171 high-contrast crimson validation alert banner and 2px red field border on #351316 dark crimson alert background)',
  },
  'expense-tracker': {
    anchorMode: 'expand-set',
    anchorStep: 'step1-error.jpg',
    steps: ['step1-ledger.jpg', 'step2-entry.jpg', 'step3-summary.jpg', 'step1-error.jpg'],
    lightTheme: 'CRISP ACCOUNTING PAPER & SPRUCE LIGHT MODE (#f8fafc crisp financial paper background reaching all four image edges, #ffffff ledger and form cards with 1px #cbd5e1 accounting rules, #0f172a tabular-numeral ink, #0f766e spruce-teal primary button, #b91c1c crimson validation alert)',
    darkTheme: 'NOCTURNAL FINANCIAL LEDGER DARK MODE (#0b1116 deep slate-ledger page ground reaching all four image edges, #131d26 elevated form and ledger card surfaces with 1px #243442 accounting grid rules, #f1f5f9 crisp white tabular-numeral ink, #14b8a6 luminous spruce-teal primary button, #f87171 high-contrast crimson validation alert banner and 2px red outline on the -42.50 Amount field)',
  },
  'job-board': {
    anchorMode: 'expand-set',
    anchorStep: 'step1-error.jpg',
    steps: ['step1-listings.jpg', 'step2-detail.jpg', 'step3-post.jpg', 'step1-error.jpg'],
    lightTheme: 'CRISP NORDIC BIOTECH DAYLIGHT LIGHT MODE (#f0fdfa pale clinical mint-ice page background reaching all four image edges, #ffffff structured form card with 1px #ccfbf1 border, #134e4a deep pine-teal ink, #0d9488 clinical teal primary button, #be123c rose-crimson validation)',
    darkTheme: 'DEEP LAB OBSIDIAN & BIOLUMINESCENT TEAL DARK MODE (#071314 deep lab-teal page ground reaching all four image edges, #0f2224 structured form card surface with 1px #1e3f42 border, #f0fdfa crisp mint-white typography, #2dd4bf bioluminescent teal primary button, #fb7185 high-contrast rose-crimson validation banner and 2px red outlines on Job Title and Contact Email)',
  },
  'library-catalogue': {
    anchorMode: 'expand-set',
    anchorStep: 'step3-refusal.jpg',
    steps: ['step1-index.jpg', 'step2-specimen.jpg', 'step3-refusal.jpg', 'step4-empty.jpg'],
    lightTheme: 'BODLEIAN ARCHIVAL VELLUM & OXFORD BURGUNDY LIGHT MODE (#f8f6f0 archival cotton-vellum page background reaching all four image edges, #ffffff reading-room call-slip card with 1px #d6d3d1 stone border, #1c1917 iron-gall ink, #7f1d1d Oxford burgundy primary button, #dc2626 validation alert)',
    darkTheme: 'NOCTURNAL READING ROOM OAK & CRIMSON DARK MODE (#141210 dark library-oak page ground reaching all four image edges, #211e1a reading-room call-slip card surface with 1px #38322c warm stone border, #f5f2eb archival parchment typography, #e11d48 warm Oxford crimson-burgundy primary button, #f87171 high-contrast crimson validation banner and 2px red outlines on Researcher name and Reservation date)',
  },
  'restaurant-ordering': {
    anchorMode: 'expand-set',
    anchorStep: 'step1-error.jpg',
    steps: ['step1-menu.jpg', 'step2-order.jpg', 'step3-confirmation.jpg', 'step1-error.jpg'],
    lightTheme: 'WARM SOURDOUGH CRUST & BUTTER-CREAM LIGHT MODE (#fffbeb warm flour-cream page background reaching all four image edges, #ffffff card surfaces with 1px #fde68a golden-wheat borders, #451a03 dark roasted-crust espresso ink, #b45309 golden-crust amber primary button, #b91c1c crimson validation alert)',
    darkTheme: 'WOOD-FIRED HEARTH EVENING DARK MODE (#17110b warm oven-charcoal page ground reaching all four image edges, #261c12 elevated card surfaces with 1px #3d2d1d warm amber-brown borders, #fef3c7 warm cream typography, #f59e0b golden-amber "Browse the menu" primary button, #f87171 high-contrast crimson validation banner at top of checkout)',
  },
  'survey-form': {
    anchorMode: 'expand-set',
    anchorStep: 'step3-validation.jpg',
    steps: ['step1-questionnaire.jpg', 'step2-review.jpg', 'step3-validation.jpg', 'step4-submitted.jpg'],
    lightTheme: 'CIVIC TRANSIT DAYLIGHT LIGHT MODE (#f8fafc clean civic daylight paper background reaching all four image edges, #ffffff questionnaire card with 2px #cbd5e1 borders, #1e3a8a transit roundel navy header and primary Continue button, #d97706 signal-amber progress indicator, #dc2626 crimson alert)',
    darkTheme: 'NIGHT TUBE CIVIC DARK MODE (#090f1d deep transit-navy page ground reaching all four image edges, #111c33 elevated questionnaire card surface with 2px #233559 structural borders, #1e3a8a / #3b82f6 luminous royal-blue header and primary Continue button, #f59e0b signal-amber progress indicator, #f8fafc crisp white typography, #f87171 high-contrast crimson alert banner and 2px red outlines on the two unanswered rating rows)',
  },
  'web-shop': {
    anchorMode: 'expand-set',
    anchorStep: 'step1-empty.jpg',
    steps: ['step1-ciders.jpg', 'step2-preorder.jpg', 'step3-confirmation.jpg', 'step1-empty.jpg'],
    lightTheme: 'WARM HARVEST ORCHARD CREAM & RUSSET LIGHT MODE (#fdfbf7 warm pressed-linen page background reaching all four image edges, #ffffff empty-basket card with 1px #e7e5e4 warm stone border, #382013 deep orchard-bark brown ink, #b45309 harvest russet-amber primary button)',
    darkTheme: 'CELLAR BARREL OAK & RUSSET DARK MODE (#16110d deep cider-cellar oak page ground reaching all four image edges, #241c15 elevated empty-basket card surface with 1px #3b2e23 warm stone border, #faf6f0 warm linen typography, #f59e0b harvest russet-amber "Browse the ciders" primary button, visibly disabled dark checkout button below)',
  },

  // --- 6 Light-Anchored Multi-Step Archetypes ---
  booking: {
    anchorMode: 'light-anchor',
    steps: ['step1-browse.jpg', 'step2-form.jpg', 'step3-confirmation.jpg', 'step4-error.jpg', 'step5-empty.jpg'],
    lightTheme: 'WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff tactile card surfaces with 1px #e7e5e4 warm stone borders, #1c1917 deep espresso ink, #c2410c terracotta glaze primary action buttons, #15803d sage-green verified badge, #b91c1c crimson error alert)',
    darkTheme: 'WARM ESPRESSO EVENING DARK MODE (#1c1917 rich kiln-charcoal background reaching all four edges, #292524 warm basalt card surfaces with 1px #44403c stone borders, #fafaf9 warm ivory text, #a8a29e muted stone labels, #ea580c warm terracotta-amber primary action buttons, #22c55e sage-emerald verified badge, #f87171 crimson error alert)',
    lightStepOverrides: {
      'step3-confirmation.jpg': 'Step 3: Booking Confirmation & Digital Studio Pass in WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff perforated studio pass card with 1px #e7e5e4 warm stone border, #1c1917 espresso ink, #c2410c terracotta glaze primary button, #15803d sage-green verified badge). Keep the exact same top navigation bar from Step 1 ("Evening Class Studio", Browse Workshops, My Bookings badge 1, Light mode active). Center a tactile perforated studio pass card with a green verified check badge, editorial serif headline "Booking Confirmed!", booking reference "#BK-92841", workshop details (Wheel-Thrown Stoneware Pottery, Monday 26 Oct 2026, 6:30 PM – 8:30 PM, Kiln Room B, Wheel Bench B3, Instructor: Dr. Evelyn Reed), attendee "Alex Thompson", receipt "Paid £45.00 · Materials included", a crisp illustrative QR code for studio check-in, terracotta primary button "Add to Calendar", and secondary button "Download PDF Receipt".',
      'step5-empty.jpg': 'Step 5: Honest Empty Schedule State in WARM CERAMIC DAYLIGHT LIGHT MODE (#fbf8f3 warm kiln-clay paper background reaching all four edges, #ffffff empty-state card with 1px #e7e5e4 warm stone border, #1c1917 espresso ink, #c2410c terracotta glaze primary button). Keep the exact same top navigation bar and weekly schedule filter bar from Step 1, with "Sunday" and category chip "Advanced Porcelain Glazing" active. Center a clean empty-state card featuring a minimal ceramic vessel line icon, editorial serif heading "No Workshops Scheduled for this Selection", helpful copy "Our kilns cool down on Sundays and no sessions match this filter. Explore weekday evening classes or clear your filter.", primary terracotta button "Reset Filters", and secondary link "View Full Monthly Timetable".',
    },
  },
  catalogue: {
    anchorMode: 'light-anchor',
    steps: ['step1-grid.jpg', 'step2-cart.jpg', 'step3-empty.jpg'],
    lightTheme: 'SUNLIT LINEN & OLIVE DAYLIGHT LIGHT MODE (#f7f5f0 warm oat-linen page background reaching all four edges, #ffffff clean ceramic product cards and slide-over drawer surface with 1px #e7e5e4 stone borders, #292524 deep charcoal ink, #3f6212 muted olive-moss primary action buttons and active filter pills)',
    darkTheme: 'ROASTED WALNUT & MOSS EVENING DARK MODE (#181615 rich roasted-walnut dark ground reaching all four edges, #24211f elevated ceramic product cards and slide-over drawer surface with 1px #3b3632 borders, #fafaf9 warm ivory text, #a8a29e muted stone metadata, #65a30d olive-lime primary action buttons and active filter pills)',
    lightStepOverrides: {
      'step2-cart.jpg': 'Step 2: Slide-Out Cart Drawer & Order Review in 100% SUNLIT LINEN & OLIVE DAYLIGHT LIGHT MODE (#f7f5f0 warm oat-linen page background, #ffffff slide-over drawer surface at right with 1px #e7e5e4 stone border, #faf8f5 itemized pottery cards inside the drawer, #292524 deep charcoal ink, #3f6212 muted olive-moss primary checkout button). Keep the exact Step 1 Kanso Studio product grid visible and softly dimmed on the left, and open a crisp daylight #ffffff slide-over drawer on the right headed "Your Studio Bag (2)" with two itemized pottery pieces ("Ash-Glaze Stoneware Bowl £24.00", "Raw Clay Tokoname Vase £38.00"), tactile quantity steppers (- 1 +), remove link, subtotal £62.00, notice "Complimentary plastic-free courier shipping over £50 applied", and prominent olive-moss (#3f6212) "Proceed to Checkout" button.',
    },
  },
  'account-recovery': {
    anchorMode: 'light-anchor',
    steps: ['step1-request.jpg', 'step2-sent.jpg', 'step3-refusal.jpg'],
    lightTheme: 'CRISP ALABASTER & ROYAL COBALT DAYLIGHT LIGHT MODE (#f8fafc cool alabaster page background reaching all four edges, #ffffff elevated authentication card with 1px #e2e8f0 hairline border, #0f172a deep slate ink typography, #2563eb royal cobalt primary action button, #dc2626 crimson validation alert)',
    darkTheme: 'CARBON-INDIGO DARK MODE (#0c0a1d deep midnight-indigo page ground reaching all four edges, #16132d elevated authentication card with 1px #2e2952 border, #f8fafc crisp white typography, #94a3b8 muted slate labels, #6366f1 luminous indigo primary action button, #f87171 crimson validation alert)',
    lightStepOverrides: {
      'step2-sent.jpg': 'Step 2: Email Sent Confirmation in CRISP ALABASTER & ROYAL COBALT DAYLIGHT LIGHT MODE (#f8fafc cool alabaster page background reaching all four edges, #ffffff elevated authentication card with 1px #e2e8f0 hairline border, #0f172a deep ink typography, #2563eb royal cobalt primary action button). Keep the exact same top security header bar with Vanguard Identity shield wordmark and "System Status: Operational" pill from Step 1. Inside the centered #ffffff authentication card, display a royal-cobalt & emerald envelope-check badge, headline "Check Your Inbox", clear copy "We sent a one-time recovery link to alex@example.com. The link expires in 15 minutes.", security fingerprint badge "Request ID: VG-8841-AUTH", notice "Didn\'t receive the email? Check spam or Resend in 58s", primary royal cobalt (#2563eb) button "Open Email App", and link "Return to Sign In".',
    },
  },
  'product-card-comparison': {
    anchorMode: 'light-anchor',
    steps: ['step1-cards.jpg', 'step2-compare.jpg', 'step3-selected.jpg', 'step4-empty.jpg'],
    lightTheme: 'ANODIZED ALUMINIUM & COBALT DAYLIGHT LIGHT MODE (#f3f4f6 brushed aluminium light grey page ground reaching all four edges, #ffffff precision spec cards and comparison matrix surfaces with 1px #d1d5db hairline borders, #111827 crisp technical sans/monospace ink, #0284c7 industrial cobalt-blue primary buttons and checkmarks)',
    darkTheme: 'WORKSTATION GRAPHITE DARK MODE (#111317 neutral anodized graphite page ground reaching all four edges, #1c2026 elevated spec card and comparison matrix surfaces with 1px #2e3440 hairline borders, #f3f4f6 crisp white technical ink, #9ca3af muted silver metadata, #38bdf8 electric sky-cobalt primary buttons and checkmarks)',
    lightStepOverrides: {
      'step3-selected.jpg': 'Step 3: The Selection Carried Forward in ANODIZED ALUMINIUM & COBALT DAYLIGHT LIGHT MODE (#f3f4f6 brushed aluminium light grey page ground reaching all four edges, #ffffff elevated build card surfaces with 1px #d1d5db hairline borders, #111827 crisp technical ink, #0284c7 industrial cobalt-blue primary button, #16a34a emerald confirmation badge). Keep the exact same top Rig Selection Board header from Step 1. Main #ffffff confirmation panel headed "Your selection" displays a green badge "Selected card carried into your build", the chosen GPU card "Northwind Arc A770" with four aligned spec rows (Memory 16 GB, Power draw 225 W, Length 280 mm, Warranty 3 years), price £629, "Score 8.7 / 10", "Change selection" link, and filled industrial cobalt (#0284c7) button "Continue with this card". Right-hand narrower #ffffff panel "Still comparing" lists the two remaining compared cards ("Vector VX-4070", "Halcyon RX-7800") with "Remove" buttons and note "Your comparison is kept until you clear it".',
    },
  },
  'saas-workspace-board': {
    anchorMode: 'light-anchor',
    steps: [
      'step1-board-and-inspector.jpg',
      'step2-command-palette-popover.jpg',
      'step3-filtered-table-view-transition.jpg',
      'step4-empty-filter-and-quick-create.jpg',
    ],
    lightTheme: 'CRISP ALABASTER & INDIGO DAYLIGHT LIGHT MODE (#f8fafc cool alabaster workspace ground, #f1f5f9 left project navigation rail, #ffffff Kanban issue cards, right-hand inspector pane, command palette popover, and table rows with 1px #e2e8f0 hairline borders, #0f172a crisp slate ink, #4f46e5 indigo primary accent)',
    darkTheme: 'LINEAR SLATE & INDIGO DARK MODE (#090d16 continuous dark slate ground, #111827 left project navigation rail, #1e293b Kanban issue cards, right-hand inspector pane, command palette popover, and table rows with 1px #334155 hairline borders, #f8fafc off-white typography, #6366f1 luminous indigo primary accent)',
    lightStepOverrides: {
      'step2-command-palette-popover.jpg': 'Step 2: Open Cmd+K Command Palette and KES-218 Status Action Group in CRISP ALABASTER & INDIGO DAYLIGHT LIGHT MODE (#f8fafc alabaster ground, #f1f5f9 left rail, #ffffff cards and inspector with 1px #e2e8f0 borders, #0f172a ink, #4f46e5 indigo accent). Preserve the exact three-pane Kestrel Sprint 24 layout, four board columns, and KES-218 in the right inspector from Step 1. In the foreground centre of the web page, show an elevated #ffffff non-modal popover="auto" Command Palette panel with search text "assign elena" and keyboard-navigable result list ("Assign KES-218 to Elena Rostova", "Set priority → Urgent", "Move KES-218 to In Review", "Switch view to Grouped Table") with Enter / ⌘A shortcut hints. Beside KES-218\'s status badge, show a compact contextual dropdown tethered to the badge.',
      'step3-filtered-table-view-transition.jpg': 'Step 3: Grouped Table after switching from Board with three rows selected in CRISP ALABASTER & INDIGO DAYLIGHT LIGHT MODE (#f8fafc alabaster ground, #f1f5f9 left project rail, #ffffff table surface with 1px #e2e8f0 row borders, #0f172a ink, #4f46e5 indigo selected controls). Preserve the exact Kestrel left project rail and top header from Step 1. The centre region now shows a semantic GROUPED TABLE view of sprint issues; Board/Table toggle marks Table selected and active removable filter chips read "Priority: High" and "Component: Firmware". Three issue rows have visible checked indigo checkboxes, including KES-218: Fix SPI bus contention during flash write. Show a floating bottom bulk-action bar "3 issues selected · Move to In Review · Assign owner · Export JSON".',
      'step4-empty-filter-and-quick-create.jpg': 'Step 4: Empty Filter State plus Invalid Quick-Create Issue Dialog in CRISP ALABASTER & INDIGO DAYLIGHT LIGHT MODE (#f8fafc alabaster ground, #f1f5f9 left project rail, #ffffff table and dialog card surfaces with 1px #e2e8f0 borders, #0f172a ink, #4f46e5 indigo primary button, #dc2626 crimson validation error). Behind a site-owned open native <dialog> form (NO OS window buttons), show the Kestrel Table view filtered by query "bootloader-panic" with zero-match message "No issues match bootloader-panic" and a "Clear filters" button. In the foreground #ffffff native web dialog titled "Quick-create issue", keep the required "Issue title" text field empty after an attempted submit with a 2px #dc2626 red outline and inline error "Enter a concise issue title before creating". Under it, the "Reproduction steps (Markdown)" textarea retains "Reflash controller; run telemetry; capture boot log", and Create / Close buttons remain legible.',
    },
  },
  'interactive-product-configurator': {
    anchorMode: 'light-anchor',
    steps: [
      'step1-frame-and-geometry.jpg',
      'step2-drivetrain-and-wheelset-swap.jpg',
      'step3-compatibility-conflict.jpg',
      'step4-saved-build-comparison-sheet.jpg',
    ],
    lightTheme: 'SUNLIT LIMESTONE WORKSHOP DAYLIGHT LIGHT MODE (#f5f4f0 warm limestone page ground, #eae8e1 left 60% bicycle preview stage, #ffffff right 40% accordion control panel and comparison sheet with 1px #d6d3cd stone borders, #1c1917 deep charcoal ink, #b45309 warm anodised-bronze / amber selection accent)',
    darkTheme: 'BESPOKE TITANIUM WORKSHOP DARK MODE (#0f172a dark slate page ground, #152033 left 60% bicycle preview stage, #1e293b right 40% accordion control panel and comparison sheet with 1px #334155 borders, #f8fafc crisp white typography, #f59e0b warm amber selection accent)',
    lightStepOverrides: {
      'step2-drivetrain-and-wheelset-swap.jpg': 'Step 2: Drivetrain & Wheelset Selection in SUNLIT LIMESTONE WORKSHOP DAYLIGHT LIGHT MODE (#f5f4f0 warm limestone page ground, #eae8e1 left 60% bicycle stage, #ffffff right 40% accordion panel with 1px #d6d3cd borders, #1c1917 charcoal ink, #b45309 warm bronze-amber selection accent). Preserve the exact Atelier Velo header, split layout, and side-profile titanium gravel bike from Step 1. RIGHT: a step-nav band reading exactly "01. Frame & Geometry | 02. Drivetrain | 03. Cockpit & Upgrades | 04. Compare & Share" with "02. Drivetrain" active; accordion heading "1. Frame & Geometry" CLOSED with summary "56cm · Raw Brushed Ti"; accordion heading "2. Drivetrain" OPEN with selected options "40mm Deep Carbon Gravel Wheelset (+£620, −310g illustration estimate)" and "1x12 Wireless Electronic Mullet Groupset (+£450, 0g difference assumed for this STORYBOARD only)"; accordion heading "3. Cockpit & Upgrades" CLOSED. LEFT: show deep carbon rims and tan-wall gravel tyres on the same bike silhouette. Sticky bottom BOM strip lists base £3,480, carbon wheel +£620, mullet group +£450, sum "£4,550 · Est. 8.11 kg".',
      'step3-compatibility-conflict.jpg': 'Step 3: Tyre/Mudguard Compatibility Conflict in SUNLIT LIMESTONE WORKSHOP DAYLIGHT LIGHT MODE (#f5f4f0 warm limestone page ground, #eae8e1 left 60% bicycle stage, #ffffff right 40% accordion panel with 1px #d6d3cd borders, #1c1917 charcoal ink, #b45309 warm bronze-amber accent, #b91c1c crimson-amber conflict callout). Preserve the exact Atelier Velo header, split layout, and titanium gravel bike from Step 1. RIGHT: a step-nav band reading exactly "01. Frame & Geometry | 02. Drivetrain | 03. Cockpit & Upgrades | 04. Compare & Share" with "03. Cockpit & Upgrades" active; accordion headings "1. Frame & Geometry" and "2. Drivetrain" CLOSED above the OPEN accordion heading "3. Cockpit & Upgrades", whose rows are the tyres, mudguards and dynamo-lighting choices: checked tyres "650b x 2.1\\" Knobby Trail Tyres" next to selected "45mm Full-Coverage Alloy Mudguards". Show a clear warning callout card with text "Clearance conflict: 650b x 2.1\\" tyres (53mm) exceed the 45mm mudguard bridge clearance", plus two replacement buttons "Switch to 58mm Expedition Mudguards (+£35)" and "Switch to 700c x 38mm Slick Tyres". Beneath them show "Fit remains unverified until manufacturer clearances checked; reservation unavailable".',
      'step4-saved-build-comparison-sheet.jpg': 'Step 4: Saved Build Comparison & Draft Share Link in SUNLIT LIMESTONE WORKSHOP DAYLIGHT LIGHT MODE (#f5f4f0 warm limestone page ground, #ffffff comparison sheet with 1px #d6d3cd stone borders, #1c1917 charcoal ink, #b45309 warm bronze-amber highlights). Keep the Atelier Velo header and bicycle preview stage visible. A step-nav band reads exactly "01. Frame & Geometry | 02. Drivetrain | 03. Cockpit & Upgrades | 04. Compare & Share" with "04. Compare & Share" active. Open the clean in-page #ffffff comparison sheet headed "4. Compare & Share" (NO OS window controls) with two saved builds side by side: "Build A — Alpine Fast Packing · Est. 8.11 kg · £4,550" and "Build B — Four-Season Randonneur · Est. 9.38 kg · £3,690", aligning rows for frame, finish, wheels, tyres, mudguards, and dynamo. A separate CURRENT DRAFT C share-link field in page UI contains "?size=56&finish=bronze&wheels=carbon40&dynamo=son28". Show a "Save & Reserve Workshop Slot" button alongside "Saved locally · Workshop slot not yet reserved".',
    },
  },

  // --- 3 Dark-Anchored Multi-Step Archetypes ---
  'fan-community-site': {
    anchorMode: 'dark-anchor',
    steps: ['step1-collection.jpg', 'step2-contribution.jpg', 'step3-my-contributions.jpg', 'step4-moderation.jpg', 'step5-visitor.jpg'],
    lightTheme: 'WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper background reaching all four edges, #ffffff tactile archive and form card surfaces with 1px #e7e5e4 warm stone borders, #261f29 deep aubergine-ink typography, #b45309 warm lantern-brass primary buttons and active indicators)',
    darkTheme: 'WARM VELVET & BRASS SCREENING ROOM DARK MODE (#18131a warm aubergine-charcoal page ground reaching all four edges, #261f29 tactile archive and form card surfaces with 1px #3d3142 borders, #faf5ff warm cream typography, #c4b5fd muted lavender metadata, #d97706 warm lantern-brass primary buttons and active indicators)',
    lightStepOverrides: {
      'step1-collection.jpg': 'Step 1: Canon Collection Browse in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff tactile archive card surfaces with 1px #e7e5e4 warm stone borders, #261f29 deep aubergine-ink typography, #b45309 warm lantern-brass primary accent). Preserve the exact layout, top masthead ("Lantern Works Fan Registry", Collection, Contributions, Moderators, "@brasslamp · Fan"), left CANON COLLECTION sidebar (Characters, Sets and Props, Ephemera, Interviews), search/sort controls ("128 artefacts"), and 3×2 grid of six stop-motion puppet and miniature set cards ("The Lamplighter\'s Coat", "Set 12 - Harbour Street", "Aunt Martha\'s Teapot", etc.) from the reference image, rendered cleanly in Warm Curatorial Vellum Light Mode.',
      'step2-contribution.jpg': 'Step 2: Contribution Composer in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff form card surface with 1px #e7e5e4 stone border, #261f29 deep aubergine-ink text, #b45309 warm lantern-brass primary button). Keep the exact same top masthead from Step 1. Single centered column form headed "Contribute to the registry" with labelled fields: Title ("Harbour Street lighting rig"), Section select ("Sets and Props"), Media link, Notes textarea, and Tags chip input ("Character", "Behind the scenes"). Below the fields, an inline notice panel with a brass left border reads "This goes to a moderator before it is public". Sticky bottom action bar holds a lantern-brass (#b45309) button "Submit for review", secondary "Save draft", and status "Draft saved 2 minutes ago".',
      'step3-my-contributions.jpg': 'Step 3: Contributor\'s Own Contributions and Bookmarks in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff bordered contribution rows with 1px #e7e5e4 stone rules, #261f29 deep aubergine-ink typography, #b45309 lantern-brass links and active tab indicator). Keep the exact same top masthead from Step 1. Page heading "Your contributions" with tab row: Contributions (selected) and Bookmarks. Vertical list of four contribution rows showing title, section chip, submitted date, and moderation status chip on the right: two amber chips "In review", one green chip "Published", and one crimson chip "Needs changes" with a quoted moderator note underneath ("The lighting rig photo is from the reboot, not the original run") and an "Edit and resubmit" link. Below, a "Bookmarked in the collection" card lists three saved artefacts with Remove buttons.',
      'step4-moderation.jpg': 'Step 4: Moderator Queue in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff queue cards with 1px #e7e5e4 stone borders, #261f29 deep aubergine-ink text, #b45309 warm lantern-brass primary button). Keep the exact same top masthead from Step 1. Heading "Moderation queue" with badge "7 awaiting a decision" and filter chips Pending (selected), Held, Published. Main column shows three pending stop-motion artefact contributions with thumbnail, title, handle, timestamp, notes, and action buttons: green outlined "Approve", amber outlined "Hold", and "Open full contribution". The middle card is expanded with a "Reason (shown to the contributor)" input containing "Needs a source for the date claim" and a lantern-brass (#b45309) primary button "Record decision". Right rail summarises "Today\'s activity: 4 approved, 2 held, 1 needs changes".',
      'step5-visitor.jpg': 'Step 5: Signed-Out Visitor\'s View of the Collection in WARM CURATORIAL VELLUM LIGHT MODE (#fdfaf6 warm museum-vellum paper ground reaching all four edges, #ffffff artefact cards with 1px #e7e5e4 stone borders, #261f29 deep aubergine-ink text, #b45309 warm lantern-brass accents). Keep the same top masthead from Step 1 except the right side shows a plain "Sign in" link instead of "@brasslamp". Slim notice banner reads "Showing published contributions only" with subtitle "Contributions awaiting moderation are not shown here". Controls row with search input, sort "Newest first", and count "Showing 3 of 128 artefacts". Left sidebar lists Characters, Sets and Props, Ephemera, Interviews. Beside it, one symmetrical row of three artefact cards ("The Lamplighter\'s Coat", "Set 12 - Harbour Street", "Aunt Martha\'s Teapot"), each with one green "Published" chip and one outline "Bookmark" button (first card showing tooltip "Sign in to bookmark").',
    },
  },
  'scroll-storytelling-launch': {
    anchorMode: 'dark-anchor',
    steps: [
      'step1-hero-overview.jpg',
      'step2-scroll-exploded-anatomy.jpg',
      'step3-finish-material-switcher.jpg',
      'step4-spec-comparison-drawer.jpg',
    ],
    lightTheme: 'ARCHITECTURAL WARM IVORY GALLERY LIGHT MODE (#f7f5f0 sunlit gallery stone page ground reaching all four edges, #ffffff tactile card/panel/drawer surfaces with 1px #e7e5e4 stone hairline borders, #1c1917 crisp charcoal display and UI ink, #b45309 warm brushed-copper primary accent and progress rule)',
    darkTheme: 'WARM ESPRESSO-BRONZE ACOUSTIC STUDIO DARK MODE (#14110f warm espresso-obsidian page ground reaching all four edges, #1f1a17 raised smoked-bronze card/panel/drawer surfaces with 1px #382e29 borders, #fafaf9 warm alabaster display and UI typography, #d97706 brushed champagne-copper primary accent and progress rule)',
    lightStepOverrides: {
      'step1-hero-overview.jpg': 'Step 1: Hero & Sticky Chapter Nav in ARCHITECTURAL WARM IVORY GALLERY LIGHT MODE (#f7f5f0 sunlit gallery stone page ground reaching all four edges, #ffffff tactile spec badges with 1px #e7e5e4 stone borders, #1c1917 crisp charcoal display text, #b45309 warm brushed-copper primary button and scroll-progress rule). Preserve the exact layout, sticky top chapter bar ("Aether Audio", Overview / Acoustics / Materials / Compare / Pre-order, Reduced motion toggle pill), dominant central studio product photograph of the Aether One planar magnetic headphones, headline "Precision you can see through", three badges ("98 mm Planar Driver", "0.04% THD @ 1 kHz", "310 g Milled Titanium"), "Pre-order £649" CTA, and footnote "Aether concept · specifications unverified" from the reference image, rendered in Architectural Warm Ivory Gallery Light Mode.',
      'step2-scroll-exploded-anatomy.jpg': 'Step 2: Scroll-Scrubbed Exploded Driver Anatomy in ARCHITECTURAL WARM IVORY GALLERY LIGHT MODE (#f7f5f0 sunlit gallery stone page ground reaching all four edges, #ffffff callout cards and chart panel with 1px #e7e5e4 stone borders, #1c1917 crisp charcoal typography, #b45309 warm brushed-copper accents). Keep the exact sticky Aether Audio top chapter bar from Step 1 with "Acoustics" active. On the main stage, show an exploded stack of the Aether One driver with three clearly separate labelled layers: CNC aluminium baffle, dual neodymium magnet array, and 2-micron ultra-thin diaphragm, with clean #ffffff anchor-positioned callout cards attached to each layer. Nearby, show a frequency-response comparison panel labelled "Diffuse Field Target" and "Aether One Measured — illustrative / source pending".',
      'step3-finish-material-switcher.jpg': 'Step 3: Interactive Finish & Ear-Pad Material Switcher in ARCHITECTURAL WARM IVORY GALLERY LIGHT MODE (#f7f5f0 sunlit gallery stone page ground reaching all four edges, #ffffff tactile swatch panels with 1px #e7e5e4 borders, #1c1917 charcoal ink, #b45309 warm brushed-copper active highlight). Keep the exact sticky Aether Audio top chapter bar from Step 1 with "Materials" active. Center the Aether One over-ear headphones in Warm Brushed Copper with Acoustic Micro-Suede ear pads on a sunlit stone pedestal. Side control bench shows finish buttons ("Anodised Obsidian", "Raw Bead-Blasted Titanium", "Warm Brushed Copper" selected) and ear-pad buttons ("Perforated Lambskin", "Acoustic Micro-Suede" selected), badge "Isolation delta: pending verification", and sticky bottom summary bar "Aether One · Brushed Copper · Acoustic Micro-Suede · Ships 18 Nov 2026 · £649".',
      'step4-spec-comparison-drawer.jpg': 'Step 4: Open Technical Specification & Model Comparison Drawer in ARCHITECTURAL WARM IVORY GALLERY LIGHT MODE (#f7f5f0 sunlit gallery stone page ground softly dimmed in background, #fafaf9 / #ffffff full-height slide-over <dialog> drawer with 1px #e7e5e4 hairline rules, #1c1917 charcoal typography, #b45309 copper focus accent). Inside the web page (NO OS window buttons), the slide-over drawer has heading "Compare the Aether line", an in-page Close button, a reduced-motion chapter index, and three aligned product columns labelled "Aether One £649", "Aether Studio Pro £899", "Aether Reference £1,299" with row headings for driver, build, ear pads, and price. Below, show an amplifier headroom calculator with inputs "Impedance (ohms)" and "Sensitivity (dB SPL / 1 mW)" and output "Enter values to calculate required mW and V rms".',
    },
  },
  'realtime-telemetry-dashboard': {
    anchorMode: 'dark-anchor',
    steps: [
      'step1-live-overview.jpg',
      'step2-brush-zoom-and-drilldown.jpg',
      'step3-scenario-simulator.jpg',
      'step4-alert-rule-validation.jpg',
    ],
    lightTheme: 'DAYLIGHT GRID CONTROL ROOM LIGHT MODE (#f1f5f9 crisp technical daylight slate page ground reaching all four edges, #ffffff KPI card, chart, drawer, and table panel surfaces with 1px #cbd5e1 precision grid borders, #0f172a high-contrast tabular charcoal ink, #059669 emerald nominal, #d97706 amber warning, #e11d48 rose critical)',
    darkTheme: 'INDUSTRIAL CONTROL-ROOM CARBON DARK MODE (#0b0f19 continuous carbon-slate page ground reaching all four edges, #111827 KPI card, chart, drawer, and table panel surfaces with 1px #1e293b grid borders, #f8fafc tabular off-white typography, #10b981 emerald nominal, #f59e0b amber warning, #f43f5e rose critical)',
    lightStepOverrides: {
      'step1-live-overview.jpg': 'Step 1: Live-style Overview with clearly visible "Simulation — not live" status in DAYLIGHT GRID CONTROL ROOM LIGHT MODE (#f1f5f9 crisp daylight slate page ground reaching all four edges, #ffffff KPI card and chart panel surfaces with 1px #cbd5e1 borders, #0f172a high-contrast tabular charcoal ink, #059669 emerald nominal, #d97706 amber warning). Preserve the exact layout, top header ("NorthSea Grid — Dogger Bank Sector B", 1h/6h/24h/7d pills, "Accessible Data Table" toggle, "Simulate Scenario" button, UTC and "Simulation — not live" badge), four KPI cards (Net Generation 412.8 MW, Grid Frequency 50.02 Hz, Battery Reserve 78.4%, Active Warnings 1), Power MW / Wind Speed m/s chart, and 16-turbine status matrix (Turbine B-07 amber WARNING) from the reference image, rendered cleanly in Daylight Grid Control Room Light Mode.',
      'step2-brush-zoom-and-drilldown.jpg': 'Step 2: Time-Window Brush and B-07 Drill-Down, visibly marked "Simulation — not live", in DAYLIGHT GRID CONTROL ROOM LIGHT MODE (#f1f5f9 daylight slate ground, #ffffff chart and right-hand B-07 drill-down drawer surfaces with 1px #cbd5e1 borders, #0f172a tabular charcoal ink, #d97706 amber B-07 warning). Keep the exact top header and KPI strip from Step 1. The Power/Wind chart shows a shaded brush window "14:00–15:30 UTC" and zoomed gearbox-temperature excursion, plus Start / End UTC inputs. Right-hand in-page B-07 drawer displays Oil Temp 84.2°C, Rotor RPM, and Blade Pitch sparklines, a semantic "14:00–15:30 UTC readings" data table, and a disabled demo-only "Acknowledge & Derate to 80%" button with text "Not connected to turbine control".',
      'step3-scenario-simulator.jpg': 'Step 3: Dispatch & Revenue What-If Simulator, visibly labelled "Sandbox / Simulation — not live; no grid control", in DAYLIGHT GRID CONTROL ROOM LIGHT MODE (#f1f5f9 daylight slate ground, #ffffff simulator panels with 1px #cbd5e1 borders, #0f172a tabular charcoal ink, #059669 emerald / #d97706 amber accents). Keep the exact top header from Step 1. Centre an in-page scenario workspace with three labelled range sliders: "Wind Speed Delta: −15%", "Evening Peak Tariff: £145/MWh", "Battery Discharge Floor: 20%", plus "Reset to baseline". Beside them show a 24-hour battery state-of-charge curve with one DASHED Baseline line and one SOLID Scenario line, direct labels, UTC axis, and "Accessible scenario data table" control. Below show delta cards "Projected Dispatch: −38.4 MWh", "Net Revenue Delta: +£12,400", "Reserve Margin: PASS".',
      'step4-alert-rule-validation.jpg': 'Step 4: Contradictory Alert Rule and separate Fixture Incident Log, visibly marked "Simulation — not live", in DAYLIGHT GRID CONTROL ROOM LIGHT MODE (#f1f5f9 daylight slate ground, #ffffff editor and table panels with 1px #cbd5e1 borders, #0f172a tabular charcoal ink, #e11d48 crimson validation alert). Keep the exact top header from Step 1. In-page Alert Rule Editor shows two editable temperature fields "Warning threshold: 90°C" and "Critical threshold: 85°C" after a rejected submit, with a prominent crimson inline banner "Warning threshold (90°C) must be strictly below Critical threshold (85°C)", field-level error outline, and Repair/Save button. Under the form, a semantic Incident Log audit table has one prior entry "Turbine B-07 · Warning acknowledged · fixture record".',
    },
  },

  // --- 4 Re-Anchored Multi-Step Archetypes ---
  'contact-lead': {
    anchorMode: 'reanchor-light',
    steps: ['step1-form.jpg', 'step2-success.jpg', 'step3-refusal.jpg'],
    lightTheme: 'ARCHITECTURAL TRAVERTINE LIGHT MODE (#f4f4f0 warm travertine/chalk page ground reaching all four image edges with ZERO dark outer border, #ffffff precision form and dossier card surfaces, exposed 1px solid #d4d4d0 structural Swiss grid hairlines, #18181b stark graphite neo-grotesque typography, international orange / vermilion #ea580c primary CTA button)',
    darkTheme: 'MONOLITH CAST-IRON DARK MODE (#18181b architectural cast-iron dark ground reaching all four image edges, #27272a precision form and dossier card surfaces, exposed 1px solid #3f3f46 structural Swiss grid hairlines, #fafaf9 chalk white typography, #a1a1aa muted zinc metadata, international orange / vermilion #ea580c primary CTA button)',
    lightStepOverrides: {
      'step1-form.jpg': 'Step 1: Consultation Request Form for "Atelier Wren Architecture · London" in ARCHITECTURAL TRAVERTINE LIGHT MODE (#f4f4f0 warm travertine/chalk page ground reaching all four edges with ZERO dark outer border or margin, #ffffff precision form surface, exposed 1px solid #d4d4d0 structural Swiss grid hairlines, #18181b stark graphite neo-grotesque typography, vermilion #ea580c primary CTA button). Two-column Swiss grid layout: left column presents studio identity ("Atelier Wren"), Clerkenwell London address, 4 numbered consultation stages (01 Feasibility, 02 Spatial Brief, 03 Planning, 04 Detail), and response SLA pill "< 24 hrs response". Right column displays an accessible consultation form: Full Name, Work Email, Project Scope dropdown (Residential Renovation, Civic Timber Build, Gallery Retrofit), Budget Band radio pills, Project Brief textarea with character counter, and bold vermilion button "Send Consultation Request".',
      'step2-success.jpg': 'Step 2: Submission Confirmation for "Atelier Wren Architecture · London" in ARCHITECTURAL TRAVERTINE LIGHT MODE (#f4f4f0 warm travertine/chalk page ground reaching all four edges, #ffffff precision dossier card surface with exposed 1px solid #d4d4d0 structural Swiss grid lines, #18181b stark graphite typography, #ea580c vermilion primary button, #16a34a verified green check badge). Keep the exact same top header and left-hand Atelier Wren studio column (Clerkenwell London address, 4 numbered consultation stages, "< 24 hrs response" pill) from Step 1. In the right/main column, display the precision confirmation dossier card with a crisp green check badge, headline "Consultation Request Received", personalized subtext "Thank you, Elena. Senior Partner Marcus Vance will review your spatial brief and respond within 24 hours at elena@studio.com.", structured specification table echoing Project Scope (Residential Renovation, Soho) and Reference Token "#LEAD-7301", primary vermilion (#ea580c) button "Return to Practice Index", and secondary button "Download Dossier PDF".',
    },
  },
  'event-registration': {
    anchorMode: 'reanchor-light',
    steps: ['step1-event.jpg', 'step2-pass.jpg', 'step3-refusal.jpg'],
    lightTheme: 'BARBICAN BRUTALIST CONCRETE DAYLIGHT LIGHT MODE (#f3f1ed raw architectural concrete page ground reaching all four edges, #ffffff crisp modular ticket and pass cards with bold 2px solid #18181b brutalist ink borders, #18181b stark grotesque ink, electric royal violet #7e22ce primary CTA button, festival coral-crimson #e11d48 capacity pill)',
    darkTheme: 'BACKSTAGE VELVET-PLUM DARK MODE (#130d1d deep velvet-plum page ground reaching all four edges, #211733 modular ticket and pass cards with bold 2px solid #581c87 brutalist borders, #faf5ff crisp white typography, #a855f7 neon-violet primary CTA button, #fb7185 coral-crimson capacity pill)',
    lightStepOverrides: {
      'step1-event.jpg': 'Step 1: Event Details & Ticket Selection for "Future Web 2026 · Barbican Centre London" in BARBICAN BRUTALIST CONCRETE DAYLIGHT LIGHT MODE (#f3f1ed raw architectural concrete page ground reaching all four edges, #ffffff crisp modular ticket cards with bold 2px solid #18181b brutalist ink borders, electric royal violet #7e22ce primary CTA button). Architectural grid hero header reading "Future Web 2026 · 24–25 Oct 2026 · Barbican Centre, London" with a high-contrast coral-red badge reading "142 / 200 seats filled" (do NOT print any hex code text). Two-column layout below: left column shows two modular ticket tier cards for "General Admission (£120)" and "Workshop Pass (£220)" with tactile quantity steppers (- 1 +); right column shows accessible registration fields for Attendee Name, Organisation, Work Email, Dietary / Access Needs, and bold electric-violet (#7e22ce) button "Continue to Payment".',
      'step2-pass.jpg': 'Step 2: Digital Ticket Pass & Confirmation for "Future Web 2026 · Barbican Centre London" in BARBICAN BRUTALIST CONCRETE DAYLIGHT LIGHT MODE (#f3f1ed raw architectural concrete page ground reaching all four edges, #ffffff perforated lanyard pass card with bold 2px solid #18181b brutalist border, #18181b stark ink, #7e22ce electric royal violet primary button, #16a34a verified emerald pill). Keep the exact same top "Future Web 2026 · Barbican Centre, London" header bar from Step 1. Center a tactile #ffffff digital conference badge with a lanyard slot notch at top, verified green "Registration Confirmed" pill, attendee details ("Sarah Jenkins · Principal Web Engineer"), Pass Type "Workshop Pass (£220)", Event "Future Web 2026 · Oct 24–25 · Barbican London", a crisp illustrative QR code check-in graphic, primary electric-violet (#7e22ce) button "Save to Wallet", and secondary button "Download PDF Badge".',
    },
  },
  'editorial-blog': {
    anchorMode: 'reanchor-light',
    steps: ['step1-index.jpg', 'step2-article.jpg', 'step3-composer.jpg', 'step4-empty.jpg'],
    lightTheme: 'WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #ffffff story and composer cards with 1px #d6d3d1 editorial rules, #1c1917 deep letterpress charcoal ink, #14532d British racing green / forest ink masthead and interactive controls, #991b1b oxblood editorial rule and badges)',
    darkTheme: 'NOCTURNAL BROADSHEET DARK MODE (#161614 warm charcoal writer\'s studio ground reaching all four edges, #22211e elevated story and composer cards with 1px #383632 editorial rules, #fafaf9 warm ivory serif and sans typography, #22c55e forest-emerald interactive controls and buttons, #f87171 oxblood-rose editorial rule and badges)',
    lightStepOverrides: {
      'step1-index.jpg': 'Step 1: Article Index for "The Kiln Chronicle" in WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #ffffff featured story card, #1c1917 deep letterpress charcoal ink, #14532d forest green masthead and interactive controls, #991b1b oxblood editorial rule and "Editor\'s pick" badge). Classic broadsheet-inspired editorial header with high-contrast serif masthead "The Kiln Chronicle", issue number, section links, prominent search field, and tag chips (Kiln Firing, Glaze Chemistry, Workshops, Studio Notes) — do NOT print any resolution numbers like 1376x768 in the header. Main body lists five long-form article cards with kiln photography thumbnails, literary serif headlines, two-line standfirst excerpts, author bylines, dates, and reading times; the lead card carries an oxblood "Editor\'s pick" border.',
      'step3-composer.jpg': 'Step 3: Author Article Composer for "The Kiln Chronicle" in 100% WARM NEWSPRINT IVORY LIGHT MODE (#fbf9f4 warm cotton-rag paper background reaching all four edges, #ffffff left editor card and right live broadsheet preview sheet separated by 1px #d6d3d1 editorial hairlines, #1c1917 deep letterpress charcoal ink, #14532d forest green primary "Publish article" button, #991b1b oxblood pull-quote border). Keep the exact same "The Kiln Chronicle" broadsheet masthead from Step 1. Left column holds clean #ffffff labelled form inputs for Headline ("What a reduction firing does to a copper glaze"), Standfirst, Byline ("Marguerite Ash"), Section select, Tag chips, and a Markdown prose textarea on a daylight #ffffff surface. Right column renders the live #fbf9f4 broadsheet preview with serif typography and oxblood-bordered pull quote. A sticky bottom daylight bar holds "Save draft", "Preview", and a forest-green (#14532d) "Publish article" button.',
    },
  },
  'developer-media-playground': {
    anchorMode: 'reanchor-dark',
    steps: [
      'step1-split-pane-playground.jpg',
      'step2-transcript-search-highlight.jpg',
      'step3-syntax-diagnostic-state.jpg',
      'step4-preset-gallery-and-export-dialog.jpg',
    ],
    lightTheme: 'DAYLIGHT STUDIO DOCS LIGHT MODE (#f8fafc cool daylight alabaster page ground reaching all four edges, #ffffff numbered code editor pane at left, #f1f5f9 right visualiser/transcript stage and bottom timeline bar with 1px #cbd5e1 structural borders, #0f172a deep slate code and UI ink, #7c3aed deep violet editing accent, #0891b2 deep cyan playhead and spectrum accent)',
    darkTheme: 'ACOUSTIC STUDIO DARK MODE (#090d16 dark studio page ground reaching all four edges, #111827 numbered code editor pane at left, #1e293b right visualiser/transcript stage and bottom timeline bar with 1px #334155 structural borders, #f8fafc crisp white typography, #8b5cf6 luminous violet editing accent, #06b6d4 cyan playhead and spectrum accent)',
  },
};

async function processArchetype(family, config) {
  const familyDir = join(ROOT, 'docs/design/archetypes', family);
  const darkDir = join(familyDir, 'dark');
  mkdirSync(darkDir, { recursive: true });

  const designMd = readFileSync(join(familyDir, 'design.md'), 'utf8');
  const readmeMd = readFileSync(join(familyDir, 'README.md'), 'utf8');
  const prompts = extractPrompts(readmeMd);

  console.log(`\n=== [${family}] (${config.anchorMode}, ${config.steps.length} steps) ===`);

  if (config.anchorMode === 'single-light') {
    const step = config.steps[0];
    const lightPath = join(familyDir, step);
    const darkPath = join(darkDir, step);
    const lightBytes = readFileSync(lightPath);
    const basePrompt = prompts.get(step) ?? '';
    console.log(`  [${family}] generating dark/${step} from Light Mode anchor ...`);
    const darkBytes = await generateMultimodal({
      images: [lightBytes],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `The attached image is the canonical Light Mode UI board (${step}) for "${family}".`,
        `Generate the exact 1-to-1 DARK MODE twin of this exact screen in ${config.darkTheme}.`,
        `Preserve the exact same layout geometry, header navigation, typography hierarchy, cards, form inputs, text labels, and validation state from the attached image, changing ONLY the colour theme to ${config.darkTheme}.`,
        `Original state specification: ${basePrompt}`,
      ].join('\n\n'),
    });
    writeFileSync(darkPath, darkBytes);
    console.log(`  [${family}] wrote dark/${step} (${darkBytes.length} bytes)`);
    return;
  }

  if (config.anchorMode === 'expand-set') {
    const anchorStep = config.anchorStep;
    const anchorLightPath = join(familyDir, anchorStep);
    const anchorDarkPath = join(darkDir, anchorStep);
    if (!existsSync(anchorLightPath) || !existsSync(anchorDarkPath)) {
      throw new Error(`expand-set requires existing anchor boards: ${anchorLightPath} and ${anchorDarkPath}`);
    }
    const anchorLightBytes = readFileSync(anchorLightPath);
    const anchorDarkBytes = readFileSync(anchorDarkPath);
    console.log(`  [${family}] using existing anchor Light Mode ${anchorStep} (${anchorLightBytes.length} bytes) and Dark Mode dark/${anchorStep} (${anchorDarkBytes.length} bytes)`);

    for (const step of config.steps) {
      if (step === anchorStep) {
        console.log(`  [${family}] skipping anchor board ${step} (preserved byte-identical)`);
        continue;
      }
      const lightPath = join(familyDir, step);
      const darkPath = join(darkDir, step);
      const stepSpec = config.lightStepOverrides?.[step] ?? prompts.get(step) ?? '';
      if (!stepSpec) {
        throw new Error(`no prompt found for ${family}/${step}`);
      }

      let stepLightBytes;
      if (!existsSync(lightPath) || process.argv.includes('--force')) {
        console.log(`  [${family}] generating Light Mode ${step} (conditioned on ${anchorStep} Light + design.md) ...`);
        stepLightBytes = await generateMultimodal({
          images: [anchorLightBytes],
          prompt: [
            ANTI_CHROME_RULES,
            `Design System Context:\n${designMd}`,
            `VISUAL CONTINUITY CONTRACT: The attached image is the canonical Light Mode UI board (${anchorStep}) of this exact web application (${family}) in ${config.lightTheme}.`,
            `You MUST keep the exact same top header bar, brand logo/wordmark, navigation links, typography, surface colours, border radii, and aesthetic layout geometry from the attached image.`,
            `Render ${step} in the EXACT SAME ${config.lightTheme} (do NOT switch to dark mode; every surface and background must stay in ${config.lightTheme}):`,
            stepSpec,
          ].join('\n\n'),
        });
        writeFileSync(lightPath, stepLightBytes);
        console.log(`  [${family}] wrote Light Mode ${step} (${stepLightBytes.length} bytes)`);
      } else {
        stepLightBytes = readFileSync(lightPath);
        console.log(`  [${family}] using existing Light Mode ${step} (${stepLightBytes.length} bytes)`);
      }

      if (!existsSync(darkPath) || process.argv.includes('--force')) {
        console.log(`  [${family}] generating Dark Mode dark/${step} (conditioned on ${step} Light + dark/${anchorStep}) ...`);
        const stepDarkBytes = await generateMultimodal({
          images: [stepLightBytes, anchorDarkBytes],
          prompt: [
            ANTI_CHROME_RULES,
            `Design System Context:\n${designMd}`,
            `DUAL-REFERENCE VISUAL CONTINUITY CONTRACT:`,
            `- Image 1 is the current step (${step}) in Light Mode, showing the exact UI state, components, text, and layout for this step.`,
            `- Image 2 is the canonical Dark Mode board (dark/${anchorStep}) of the same application in ${config.darkTheme}, showing the exact Dark Mode colour palette, header styling, and surface treatment.`,
            `Render ${step} (the exact UI state and content of Image 1) in the exact Dark Mode palette and styling of Image 2 (${config.darkTheme}). Every element, label, and layout region from Image 1 must be preserved 1-to-1.`,
          ].join('\n\n'),
        });
        writeFileSync(darkPath, stepDarkBytes);
        console.log(`  [${family}] wrote Dark Mode dark/${step} (${stepDarkBytes.length} bytes)`);
      } else {
        console.log(`  [${family}] using existing Dark Mode dark/${step}`);
      }
    }
    return;
  }

  const step1 = config.steps[0];
  const step1LightPath = join(familyDir, step1);
  const step1DarkPath = join(darkDir, step1);

  let step1LightBytes;
  let step1DarkBytes;

  if (config.anchorMode === 'fresh-light') {
    const refPath = join(ROOT, config.referenceBoard);
    if (!existsSync(refPath)) {
      throw new Error(`referenceBoard not found: ${config.referenceBoard}`);
    }
    const refBytes = readFileSync(refPath);
    const step1Spec = config.lightStepOverrides?.[step1] ?? prompts.get(step1) ?? '';

    if (!existsSync(step1LightPath) || process.argv.includes('--force')) {
      console.log(`  [${family}] generating Step 1 Light Mode ${step1} (conditioned on reference.jpg + design.md) ...`);
      step1LightBytes = await generateMultimodal({
        images: [refBytes],
        prompt: [
          ANTI_CHROME_RULES,
          `Design System Context:\n${designMd}`,
          `The attached image is the approved reference board for this application family (${family}).`,
          `Generate the canonical Step 1 Light Mode screen (${step1}) in ${config.lightTheme}.`,
          `Preserve the brand identity, typography hierarchy, aesthetic character, and clean palette from the reference image, laying out the screen strictly according to the following Step 1 specification:`,
          step1Spec,
        ].join('\n\n'),
      });
      writeFileSync(step1LightPath, step1LightBytes);
      console.log(`  [${family}] wrote Light Mode ${step1} (${step1LightBytes.length} bytes)`);
    } else {
      step1LightBytes = readFileSync(step1LightPath);
      console.log(`  [${family}] using existing Light Mode ${step1} (${step1LightBytes.length} bytes)`);
    }

    if (!existsSync(step1DarkPath) || process.argv.includes('--force')) {
      console.log(`  [${family}] generating dark/${step1} from Light Mode anchor ...`);
      step1DarkBytes = await generateMultimodal({
        images: [step1LightBytes],
        prompt: [
          ANTI_CHROME_RULES,
          `Design System Context:\n${designMd}`,
          `The attached image is Step 1 (${step1}) in Light Mode (${config.lightTheme}).`,
          `Generate the exact 1-to-1 DARK MODE twin of this exact Step 1 screen in ${config.darkTheme}.`,
          `Preserve 100% of the header bar, brand wordmark, navigation items, grid/card geometry, and controls from the attached Step 1 image, translating the surface and ink palette cleanly to ${config.darkTheme}.`,
        ].join('\n\n'),
      });
      writeFileSync(step1DarkPath, step1DarkBytes);
      console.log(`  [${family}] wrote dark/${step1} (${step1DarkBytes.length} bytes)`);
    } else {
      step1DarkBytes = readFileSync(step1DarkPath);
      console.log(`  [${family}] using existing Dark Mode dark/${step1} (${step1DarkBytes.length} bytes)`);
    }
  } else if (config.anchorMode === 'light-anchor') {
    step1LightBytes = readFileSync(step1LightPath);
    console.log(`  [${family}] using existing clean Light Mode anchor ${step1} (${step1LightBytes.length} bytes)`);
    console.log(`  [${family}] generating dark/${step1} from Light Mode anchor ...`);
    step1DarkBytes = await generateMultimodal({
      images: [step1LightBytes],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `The attached image is Step 1 (${step1}) in Light Mode (${config.lightTheme}).`,
        `Generate the exact 1-to-1 DARK MODE twin of this exact Step 1 screen in ${config.darkTheme}.`,
        `Preserve 100% of the header bar, brand wordmark, navigation items, grid/card geometry, and controls from the attached Step 1 image, translating the surface and ink palette cleanly to ${config.darkTheme}.`,
      ].join('\n\n'),
    });
    writeFileSync(step1DarkPath, step1DarkBytes);
    console.log(`  [${family}] wrote dark/${step1} (${step1DarkBytes.length} bytes)`);
  } else if (config.anchorMode === 'dark-anchor') {
    // Copy existing dark Step 1 to dark/step1 if not already copied
    if (!existsSync(step1DarkPath)) {
      copyFileSync(step1LightPath, step1DarkPath);
    }
    step1DarkBytes = readFileSync(step1DarkPath);
    console.log(`  [${family}] copied existing Dark Mode anchor to dark/${step1} (${step1DarkBytes.length} bytes)`);
    console.log(`  [${family}] generating Light Mode anchor ${step1} from Dark Mode anchor ...`);
    const override1 = config.lightStepOverrides?.[step1] ?? prompts.get(step1) ?? '';
    step1LightBytes = await generateMultimodal({
      images: [step1DarkBytes],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `The attached image is Step 1 (${step1}) in Dark Mode (${config.darkTheme}).`,
        `Generate the exact 1-to-1 LIGHT MODE twin of this exact Step 1 screen in ${config.lightTheme}.`,
        `Preserve 100% of the header bar, brand wordmark, navigation items, layout geometry, subject illustration/photography, and controls from the attached image, translating the surface and ink palette cleanly to ${config.lightTheme}.`,
        `State details: ${override1}`,
      ].join('\n\n'),
    });
    writeFileSync(step1LightPath, step1LightBytes);
    console.log(`  [${family}] wrote Light Mode ${step1} (${step1LightBytes.length} bytes)`);
  } else if (config.anchorMode === 'reanchor-light') {
    const existingStep1 = readFileSync(step1LightPath);
    const override1 = config.lightStepOverrides?.[step1] ?? prompts.get(step1) ?? '';
    console.log(`  [${family}] regenerating clean Light Mode anchor ${step1} ...`);
    step1LightBytes = await generateMultimodal({
      images: [existingStep1],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `Use the attached Step 1 image as layout reference, but fix any framing/text defects so the page background fills 100% of the 1376×768 canvas edge-to-edge with zero outer border and clean typography in ${config.lightTheme}.`,
        `State details: ${override1}`,
      ].join('\n\n'),
    });
    writeFileSync(step1LightPath, step1LightBytes);
    console.log(`  [${family}] wrote clean Light Mode ${step1} (${step1LightBytes.length} bytes)`);

    console.log(`  [${family}] generating dark/${step1} from clean Light Mode anchor ...`);
    step1DarkBytes = await generateMultimodal({
      images: [step1LightBytes],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `The attached image is Step 1 (${step1}) in Light Mode (${config.lightTheme}).`,
        `Generate the exact 1-to-1 DARK MODE twin of this exact Step 1 screen in ${config.darkTheme}.`,
        `Preserve 100% of the header bar, brand wordmark, navigation items, grid/card geometry, and controls from the attached Step 1 image, translating the surface and ink palette cleanly to ${config.darkTheme}.`,
      ].join('\n\n'),
    });
    writeFileSync(step1DarkPath, step1DarkBytes);
    console.log(`  [${family}] wrote dark/${step1} (${step1DarkBytes.length} bytes)`);
  } else if (config.anchorMode === 'reanchor-dark') {
    const existingStep1 = readFileSync(step1LightPath);
    const basePrompt1 = prompts.get(step1) ?? '';
    console.log(`  [${family}] regenerating clean Dark Mode anchor dark/${step1} ...`);
    step1DarkBytes = await generateMultimodal({
      images: [existingStep1],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `Use the attached Step 1 image as visual layout reference in ${config.darkTheme}. Fix any code comment typos (ensure the comment reads "// CSS Custom Properties") and keep the exact 3-pane Resonance Lab layout.`,
        `State details: ${basePrompt1}`,
      ].join('\n\n'),
    });
    writeFileSync(step1DarkPath, step1DarkBytes);
    console.log(`  [${family}] wrote clean dark/${step1} (${step1DarkBytes.length} bytes)`);

    console.log(`  [${family}] generating Light Mode anchor ${step1} from clean Dark Mode anchor ...`);
    step1LightBytes = await generateMultimodal({
      images: [step1DarkBytes],
      prompt: [
        ANTI_CHROME_RULES,
        `Design System Context:\n${designMd}`,
        `The attached image is Step 1 (${step1}) of Resonance Lab in Dark Mode (${config.darkTheme}).`,
        `Generate the exact 1-to-1 LIGHT MODE twin of this exact Step 1 screen in ${config.lightTheme}.`,
        `Preserve 100% of the top transport bar, left numbered code editor, top-right harmonic visualiser & rotary knobs, and bottom stereo waveform timeline from the attached image, translating the palette cleanly to ${config.lightTheme}.`,
      ].join('\n\n'),
    });
    writeFileSync(step1LightPath, step1LightBytes);
    console.log(`  [${family}] wrote Light Mode ${step1} (${step1LightBytes.length} bytes)`);
  }

  // Now chain Steps 2..N in both Light Mode and Dark Mode!
  for (let i = 1; i < config.steps.length; i += 1) {
    const step = config.steps[i];
    const lightPath = join(familyDir, step);
    const darkPath = join(darkDir, step);
    const stepSpec = config.lightStepOverrides?.[step] ?? prompts.get(step) ?? '';

    let stepLightBytes;
    if (!existsSync(lightPath) || process.argv.includes('--force')) {
      console.log(`  [${family}] chaining Light Mode ${step} (conditioned on ${step1} Light + design.md) ...`);
      stepLightBytes = await generateMultimodal({
        images: [step1LightBytes],
        prompt: [
          ANTI_CHROME_RULES,
          `Design System Context:\n${designMd}`,
          `VISUAL CONTINUITY CONTRACT: The attached image is Step 1 (${step1}) of this exact web application in ${config.lightTheme}.`,
          `You MUST keep the exact same top header bar, brand logo/wordmark, navigation links, typography, surface colours, border radii, and layout geometry from the attached Step 1 image.`,
          `Render ${step} in the EXACT SAME ${config.lightTheme} (do NOT switch to dark mode; every surface and background must stay in ${config.lightTheme}):`,
          stepSpec,
        ].join('\n\n'),
      });
      writeFileSync(lightPath, stepLightBytes);
      console.log(`  [${family}] wrote Light Mode ${step} (${stepLightBytes.length} bytes)`);
    } else {
      stepLightBytes = readFileSync(lightPath);
      console.log(`  [${family}] using existing Light Mode ${step} (${stepLightBytes.length} bytes)`);
    }

    if (!existsSync(darkPath) || process.argv.includes('--force')) {
      console.log(`  [${family}] chaining Dark Mode dark/${step} (conditioned on ${step} Light + dark/${step1}) ...`);
      const stepDarkBytes = await generateMultimodal({
        images: [stepLightBytes, step1DarkBytes],
        prompt: [
          ANTI_CHROME_RULES,
          `Design System Context:\n${designMd}`,
          `DUAL-REFERENCE VISUAL CONTINUITY CONTRACT:`,
          `- Image 1 is the current step (${step}) in Light Mode, showing the exact UI state, components, text, and layout for this step.`,
          `- Image 2 is Step 1 of the same application in Dark Mode (${config.darkTheme}), showing the exact Dark Mode colour palette, header chrome, and surface styling.`,
          `Render ${step} (the exact UI state and content of Image 1) in the exact Dark Mode palette and styling of Image 2 (${config.darkTheme}). Every element, label, and layout region from Image 1 must be preserved 1-to-1.`,
        ].join('\n\n'),
      });
      writeFileSync(darkPath, stepDarkBytes);
      console.log(`  [${family}] wrote Dark Mode dark/${step} (${stepDarkBytes.length} bytes)`);
    } else {
      console.log(`  [${family}] using existing Dark Mode dark/${step}`);
    }
  }
}

async function main() {
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg === -1 ? null : process.argv[onlyArg + 1].split(',').map((s) => s.trim());
  const concurrencyArg = process.argv.indexOf('--concurrency');
  const concurrency = concurrencyArg === -1 ? 4 : Number(process.argv[concurrencyArg + 1]);

  if (!only || only.includes('browser-puzzle-game')) {
    throw new Error('browser-puzzle-game: seven committed boards have unverified model/prompt provenance; ' +
      'refusing this family before any paid generation. Obtain original response receipts or ' +
      'an authorised, attested re-generation plan before enabling it. Use --only for other configured families.');
  }
  // Fail closed (mwg-train-601b review, P1). The committed Step 1 board predates the pinned step names - its nav
  // band reads "01. Frame & Geometry | 02. Drivetrain | 03. Cockpit", it has no 04. Compare & Share entry, and its
  // panel headings substitute steps 1 and 2 - so it is not a conforming anchor. The Dark Step 1 generation and the
  // Step 2..4 Dark prompts all tell the model to preserve the attached image's labels, so a run would propagate the
  // drift the pin forbids rather than draw the pinned names. No conforming Light or Dark anchor exists yet.
  if (only?.includes('interactive-product-configurator')) {
    throw new Error('interactive-product-configurator: the committed Step 1 board is not a conforming anchor ' +
      '(nav band "01. Frame & Geometry | 02. Drivetrain | 03. Cockpit" with no 04. Compare & Share, and steps 1-2 ' +
      'panel headings substituted), and every Dark prompt requires preserving the attached image\'s labels. ' +
      'Refusing this family before any paid generation so a run cannot propagate the labels the step-name pin ' +
      'forbids. Provide verified conforming Step 1 Light and Dark anchor boards and remove this guard in a ' +
      'reviewed diff.');
  }
  const unknown = only.filter((family) => !Object.hasOwn(ARCHETYPE_CONFIGS, family));
  if (unknown.length) throw new Error(`no generator configured for: ${unknown.join(', ')}`);

  const entries = Object.entries(ARCHETYPE_CONFIGS).filter(([family]) => only.includes(family));
  const queue = [...entries];
  const failures = [];

  async function worker(workerId) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [family, config] = item;
      try {
        await processArchetype(family, config);
      } catch (err) {
        console.error(`[worker ${workerId}] FAILED ${family}: ${err.message}`);
        failures.push(`${family}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, (_, idx) => worker(idx + 1)));

  if (failures.length > 0) {
    console.error(`\n${failures.length} archetype(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nAll requested archetype Light & Dark Mode sets generated and verified clean!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
