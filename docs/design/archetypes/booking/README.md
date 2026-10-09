# Visual Design Reference: Booking (Evening Class Studio)

- **Archetype:** `booking`
- **Taxonomy Group:** `services-participation`
- **Composition Grammar:** Decision workbench / Operate
- **Theme Palette:** Deep slate background (`#0f172a`), card surfaces (`#1e293b`) with 1px border (`#334155`), emerald green action accents (`#10b981`), muted text (`#94a3b8`).
- **Exclusion from training:** `excluded_from_training: true`, `approved_for_training: false` (Visual Reference Design only).
- **Handoff and Provenance:** Generated on 2026-10-09 using `gemini-3-pro-image` via Google Antigravity OAuth image generation tool. Original prompts authored to produce high-fidelity desktop browser application mockups matching `layout-storefront.jpg` density and typography.
- **Illustrative content warning:** Names, contact details, domains, dates, class prices, seat availability, paid receipts and QR codes in the raster mockups are unverified placeholders. Do not treat them as real bookings or payment proof; do not scan the depicted QR code as an application action. These JPEGs are visual references, not functioning interfaces.

## Multi-Step Journey & State Reference Boards

1. **Step 1: Browse & Schedule Selection**
   - File: `step1-browse.jpg` (SHA-256: `941d3ca9d19e34b2025eaa1dae3570f7e97d3218f4737a3ef899249674727e4b`)
   - Model: `gemini-3-pro-image`
   - Prompt: "High-fidelity, production-quality desktop browser screenshot of an evening class booking web application. Realistic modern UI design with crisp clean typography, realistic content density, precise grid alignment, and polished micro-details matching layout-storefront.jpg. Deep slate dark background #0f172a, card surface #1e293b with subtle 1px border #334155, vivid emerald green action buttons #10b981. The viewport shows a real desktop web page with top navigation (Logo, 'Evening Class Studio', Search bar, Cart badge), an interactive weekly schedule matrix (Monday-Friday 6:00pm-9:00pm) displaying actual course cards: 'Intro to Python (6:30 PM)', 'Wheel-Thrown Pottery', 'Woodworking Essentials', each with instructor portrait, class time, pill badge showing '4 seats remaining'. Clean system-ui font, sharp text rendering, realistic browser layout. NOT a sketch, NOT a hand-drawn illustration, NOT a wireframe, NOT low-fidelity."
   - Intent: Production weekly schedule matrix with class cards, instructor avatars, capacity indicators, and direct 'Book Now' actions.

2. **Step 2: Details & Seat Selection**
   - File: `step2-form.jpg` (SHA-256: `4767765102ff750b3f9521c1a159b24e5710367cfaea88b809f987558117a5a8`)
   - Model: `gemini-3-pro-image`
   - Prompt: "High-fidelity, production-quality desktop browser screenshot of the evening class booking web application 'Evening Class Studio', following directly from Step 1. Exact same website, same theme (#0f172a slate background, #1e293b cards with 1px border #334155, emerald green #10b981 primary actions, crisp typography). Step 2: Details & Seat Selection. Top navigation intact. Main screen shows two-column booking view: Left column is an order summary card for 'Intro to Python (Monday 6:30 PM - 8:30 PM, Instructor: Dr. Evelyn Reed)' with pricing £45.00. Right column shows real form with sharp accessible inputs: Full Name ('Alex Thompson'), Email Address ('alex@example.com'), Phone Number ('+44 7700 900123'), Dietary / Access notes, and a realistic 2D desk seat selector grid (rows A-D, showing green selected desk B3, dark available desks, and muted reserved desks). Action button 'Confirm Booking (£45.00)' in emerald green. Realistic web browser interface with macOS chrome window frame, sharp text rendering. NOT a sketch, NOT a hand-drawn illustration, NOT a diagram, NOT low-fidelity."
   - Intent: Cohesive two-column checkout view with left order summary card and right personal details form + interactive 2D desk seat picker.

3. **Step 3: Confirmation & Digital Receipt**
   - File: `step3-confirmation.jpg` (SHA-256: `daf301bdcbe8cf040acc5faeb30fc5a8db86843d8ae0cc45e74fab6d8fdd5a5f`)
   - Model: `gemini-3-pro-image`
   - Prompt: "High-fidelity, production-quality desktop browser screenshot of 'Evening Class Studio', following directly from Step 2 after successful form submission. Exact same website and theme (#0f172a slate background, #1e293b cards with 1px border #334155, emerald green #10b981 accents). Step 3: Booking Confirmation & Digital Receipt. Top navigation shows 'Evening Class Studio', Browse Classes, My Bookings (active with badge 1). The main viewport displays a centered digital pass card: emerald green verified check badge, headline 'Booking Confirmed!', booking reference '#BK-92841', class details card (Intro to Python, Monday Oct 23, 6:30 PM - 8:30 PM, Room 2B, Desk B3, Instructor: Dr. Evelyn Reed), attendee 'Alex Thompson', payment receipt indicator 'Paid £45.00 via Card', a clean crisp QR code for entry check-in, and primary action buttons 'Add to Google / Apple Calendar' and 'Download PDF Receipt'. Realistic browser window frame, production web app typography and polish. NOT a sketch, NOT a hand-drawn illustration, NOT low-fidelity."
   - Intent: Digital pass card with booking reference `#BK-92841`, scannable entry QR code, receipt breakdown, and calendar/download actions.

4. **Step 4: Error & Validation State**
   - File: `step4-error.jpg` (SHA-256: `5cc76aabb6e16cb2b8b5f079d84c2ebb6dfdc3a34d557786af4b54836427ac07`)
   - Model: `gemini-3-pro-image`
   - Prompt: "High-fidelity, production-quality desktop browser screenshot of 'Evening Class Studio', showing Step 2 with validation errors. Exact same website and theme (#0f172a slate background, #1e293b cards with 1px border #334155, emerald green buttons). A prominent red/crimson alert banner at the top of the form reads: 'Please correct the highlighted fields to complete your booking'. The Full Name field is valid, but the Email Address field has a clear red 1px outline with red helper text underneath reading 'Enter a valid email address (e.g. name@domain.com)'. The seat grid shows selected desk B3 with a caution badge 'Seat B3 was just reserved by another user. Please select an available desk.' Realistic production form validation error styling in a real desktop browser window frame, crisp typography, clean micro-details matching layout-storefront.jpg. NOT a sketch, NOT a hand-drawn illustration, NOT a wireframe, NOT low-fidelity."
   - Intent: Accessible error banners, field-level inline validation messages, and seat conflict collision alerts.

5. **Step 5: Honest Empty State**
   - File: `step5-empty.jpg` (SHA-256: `0b553968c4cdc90638daf11e3ebfc6240178946f5bfffe28da19f4a1db7ce58f`)
   - Model: `gemini-3-pro-image`
   - Prompt: "High-fidelity, production-quality desktop browser screenshot of 'Evening Class Studio', showing an honest empty state. Exact same website and theme (#0f172a slate background, #1e293b card surface with 1px border #334155, emerald green buttons). Main viewport displays weekly schedule filters where 'Sunday' or 'Pottery Advanced' has no sessions scheduled. A clean, polished empty state card is displayed in the center: clean minimal calendar outline icon, heading 'No Classes Scheduled for this Selection', helpful subtext 'There are currently no sessions available for Sunday in this category. Browse upcoming weekday sessions or get notified when new dates open.', primary action button 'Reset Filters' in emerald green, and secondary text link 'View Full Monthly Calendar'. Sharp system-ui typography, realistic browser window frame, clean micro-details matching layout-storefront.jpg. NOT a sketch, NOT a hand-drawn illustration, NOT a wireframe, NOT low-fidelity."
   - Intent: Clean empty schedule filter state with calendar icon and filter reset action.
