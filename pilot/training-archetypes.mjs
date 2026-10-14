/**
 * The TRAINING-SIDE archetype registry: 15 archetypes, one per archetype id used by the tr-* briefs.
 *
 * These are deliberately a separate module from `pilot/archetypes.mjs`. `docs/eval/specs/*.json` and
 * `test/spec.test.mjs` assert that the pilot/evaluation specification set is EXACTLY ARCHETYPE_IDS, so
 * the training archetypes must never be added to the pilot table, and must never land under
 * docs/eval/specs/. The training corpus and the pilot/evaluation designs are independent by design:
 * `buildProjectFor` in `pilot/frameworks.mjs` consumes any archetype *object*, so the same builder
 * produces the two corpora while this table keeps their source data disjoint.
 *
 * The shape is exactly the pilot's (see pilot/archetypes.mjs): { id, title, story, routes[], fields[],
 * echo{}, journey{}, passwordField }. Each `routes` array carries one POST route whose `kind` starts
 * with `write` (the server-persistence write) and one `read-by-reference` route, because the generic
 * builder's server contract is a literal POST path plus a `:ref` read path.
 *
 * CRITICAL separation for `booking` and `event-registration`: those two ids also exist in
 * `pilot/archetypes.mjs`, and a training archetype that copied the pilot object would scaffold a tree
 * whose hash collides with the pilot/evaluation design - exactly what this corpus must never do. They
 * therefore get their OWN title, story, field names, form ids and journey, so the generated trees are
 * genuinely different from the pilot's. The other 13 ids have no pilot counterpart at all.
 */

const booking = {
  id: 'booking',
  title: 'House-call service visit booking',
  story: 'A mobile service takes visit bookings and shows the confirmed visit back to the customer.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/book', kind: 'write', redirect: (ref) => `/visits/${ref}` },
    { method: 'GET', path: '/visits/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/schedule', kind: 'list' },
  ],
  fields: [
    { slug: 'customer', name: 'customer', type: 'text', label: 'Customer name', autocomplete: 'name' },
    { slug: 'phone', name: 'phone', type: 'tel', label: 'Contact phone', autocomplete: 'tel' },
    { slug: 'service', name: 'service', type: 'select', label: 'Service', options: ['standard tune-up', 'full service', 'emergency call-out'] },
    { slug: 'date', name: 'date', type: 'date', label: 'Preferred date' },
    { slug: 'notes', name: 'notes', type: 'textarea', label: 'Anything the technician should know?' },
  ],
  echo: { field: 'customer', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#visit-form',
    fill: {
      'input[name=customer]': 'Amara Okafor',
      'input[name=phone]': '+44 1234 567890',
      'input[name=date]': '2026-11-02',
      'textarea[name=notes]': 'Please call before arrival',
    },
    expectText: 'Amara Okafor',
  },
  passwordField: null,
};

const webShop = {
  id: 'web-shop',
  title: 'Local pre-order shop',
  story: 'A small producer takes pre-orders and shows the order summary back to the customer.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/checkout', kind: 'write', redirect: (ref) => `/orders/${ref}` },
    { method: 'GET', path: '/orders/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/products', kind: 'list' },
  ],
  fields: [
    { slug: 'customer', name: 'customer', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'email' },
    { slug: 'items', name: 'items', type: 'textarea', label: 'Items and quantities' },
    { slug: 'collection', name: 'collection', type: 'text', label: 'Collection window' },
  ],
  echo: { field: 'customer', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#order-form',
    fill: {
      'input[name=customer]': 'Priya Nair',
      'input[name=email]': 'priya@example.test',
      'textarea[name=items]': '2 x sourdough, 1 x rye',
      'input[name=collection]': 'Saturday afternoon',
    },
    expectText: 'Priya Nair',
  },
  passwordField: null,
};

const dashboard = {
  id: 'dashboard',
  title: 'Community metrics dashboard',
  story: 'A community scheme shows usage metrics and logs a reading, then shows the updated figure back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/log', kind: 'write', redirect: (ref) => `/reading/${ref}` },
    { method: 'GET', path: '/reading/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/summary', kind: 'list' },
  ],
  fields: [
    { slug: 'member', name: 'member', type: 'text', label: 'Member account', autocomplete: 'name' },
    { slug: 'reading', name: 'reading', type: 'number', label: 'Meter reading' },
    { slug: 'note', name: 'note', type: 'text', label: 'Note' },
  ],
  echo: { field: 'member', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#reading-form',
    fill: {
      'input[name=member]': 'Meter 4021',
      'input[name=reading]': '317',
      'input[name=note]': 'peak output',
    },
    expectText: 'Meter 4021',
  },
  passwordField: null,
};

const onboardingAuth = {
  id: 'onboarding-auth',
  title: 'Volunteer onboarding and sign-in',
  story: 'A charity onboards volunteers with an account and shows the saved profile after sign-in.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/register', kind: 'write-account', redirect: () => '/profile' },
    { method: 'GET', path: '/profile', kind: 'read-session' },
  ],
  fields: [
    { slug: 'name', name: 'name', type: 'text', label: 'Full name', autocomplete: 'name' },
    { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'username' },
    { slug: 'password', name: 'password', type: 'password', label: 'Password', autocomplete: 'new-password' },
  ],
  echo: { field: 'name', source: 'session' },
  journey: {
    startPath: '/',
    formSelector: 'form#onboarding-form',
    fill: {
      'input[name=name]': 'Robin Finch',
      'input[name=email]': 'robin@example.test',
      'input[name=password]': 'correct horse battery',
    },
    expectText: 'Robin Finch',
  },
  session: true,
  passwordField: '[name=password]',
};

const directoryListing = {
  id: 'directory-listing',
  title: 'Searchable directory listing',
  story: 'A guild lists profiles and accepts a visitor note that is stored and shown back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/note', kind: 'write', redirect: (ref) => `/listing/${ref}` },
    { method: 'GET', path: '/listing/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/members', kind: 'list' },
  ],
  fields: [
    { slug: 'visitor', name: 'visitor', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'entry', name: 'entry', type: 'text', label: 'Member or listing' },
    { slug: 'note', name: 'note', type: 'textarea', label: 'Visitor note' },
  ],
  echo: { field: 'visitor', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#note-form',
    fill: {
      'input[name=visitor]': 'Sam Whitfield',
      'input[name=entry]': 'Makers row',
      'textarea[name=note]': 'Lovely ceramics',
    },
    expectText: 'Sam Whitfield',
  },
  passwordField: null,
};

// See the header comment: this id exists in pilot/archetypes.mjs (as a capacity/waitlist flow), so
// this training version is a different app - volunteer zone assignment, its own field names and a
// distinct journey - so the generated trees cannot reproduce the pilot/evaluation design.
const eventRegistration = {
  id: 'event-registration',
  title: 'Volunteer zone sign-up',
  story: 'A community event assigns volunteer zones and shows the confirmed pass back to the volunteer.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/signup', kind: 'write', redirect: (ref) => `/pass/${ref}` },
    { method: 'GET', path: '/pass/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/zones', kind: 'list' },
  ],
  fields: [
    { slug: 'volunteer', name: 'volunteer', type: 'text', label: 'Volunteer name', autocomplete: 'name' },
    { slug: 'phone', name: 'phone', type: 'tel', label: 'Contact number', autocomplete: 'tel' },
    { slug: 'zone', name: 'zone', type: 'select', label: 'Preferred zone', options: ['north shore', 'east dunes', 'carpark', 'entry gate'] },
  ],
  echo: { field: 'volunteer', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#zone-form',
    fill: {
      'input[name=volunteer]': 'Dana Whitmore',
      'input[name=phone]': '+44 7700 900123',
    },
    expectText: 'Dana Whitmore',
  },
  passwordField: null,
};

const supportHelpdesk = {
  id: 'support-helpdesk',
  title: 'Support helpdesk',
  story: 'A helpdesk takes fault tickets and shows the tracked ticket back to the reporter.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/tickets', kind: 'write', redirect: (ref) => `/ticket/${ref}` },
    { method: 'GET', path: '/ticket/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/open-tickets', kind: 'list' },
  ],
  fields: [
    { slug: 'reporter', name: 'reporter', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'equipment', name: 'equipment', type: 'text', label: 'Equipment or item' },
    { slug: 'category', name: 'category', type: 'select', label: 'Issue category', options: ['electrical', 'mechanical', 'supplies', 'other'] },
    { slug: 'description', name: 'description', type: 'textarea', label: 'Describe the problem' },
  ],
  echo: { field: 'reporter', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#ticket-form',
    fill: {
      'input[name=reporter]': 'Lee Carter',
      'input[name=equipment]': 'Enlarger 3',
      'textarea[name=description]': 'Lamp flickers during exposure',
    },
    expectText: 'Lee Carter',
  },
  passwordField: null,
};

const courseEnrolment = {
  id: 'course-enrolment',
  title: 'Course enrolment',
  story: 'A field school enrols students and shows the enrolment voucher back to them.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/enrol', kind: 'write', redirect: (ref) => `/enrolment/${ref}` },
    { method: 'GET', path: '/enrolment/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/courses', kind: 'list' },
  ],
  fields: [
    { slug: 'student', name: 'student', type: 'text', label: 'Student name', autocomplete: 'name' },
    { slug: 'contact', name: 'contact', type: 'tel', label: 'Emergency contact', autocomplete: 'tel' },
    { slug: 'course', name: 'course', type: 'text', label: 'Course title' },
    { slug: 'dietary', name: 'dietary', type: 'textarea', label: 'Dietary considerations' },
  ],
  echo: { field: 'student', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#enrolment-form',
    fill: {
      'input[name=student]': 'Maya Soren',
      'input[name=contact]': '+44 7700 300456',
      'input[name=course]': 'Wild edibles ID',
      'textarea[name=dietary]': 'None',
    },
    expectText: 'Maya Soren',
  },
  passwordField: null,
};

const surveyForm = {
  id: 'survey-form',
  title: 'Community survey',
  story: 'A survey collects responses and shows the completion receipt back to the respondent.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/survey', kind: 'write', redirect: (ref) => `/receipt/${ref}` },
    { method: 'GET', path: '/receipt/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/results', kind: 'list' },
  ],
  fields: [
    { slug: 'respondent', name: 'respondent', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'location', name: 'location', type: 'text', label: 'Street or area' },
    { slug: 'hazard', name: 'hazard', type: 'select', label: 'Main hazard', options: ['crossing', 'lighting', 'speeding', 'pavement'] },
    { slug: 'comments', name: 'comments', type: 'textarea', label: 'Additional comments' },
  ],
  echo: { field: 'respondent', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#survey-form',
    fill: {
      'input[name=respondent]': 'Jo Delgado',
      'input[name=location]': 'Church Road',
      'textarea[name=comments]': 'The crossing light is too short',
    },
    expectText: 'Jo Delgado',
  },
  passwordField: null,
};

const restaurantOrdering = {
  id: 'restaurant-ordering',
  title: 'Cottage bakery ordering',
  story: 'A cottage bakery takes weekly loaf orders and shows the pickup reference back to the customer.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/order', kind: 'write', redirect: (ref) => `/orders/${ref}` },
    { method: 'GET', path: '/orders/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/menu', kind: 'list' },
  ],
  fields: [
    { slug: 'customer', name: 'customer', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'bread', name: 'bread', type: 'text', label: 'Bread varieties and quantities' },
    { slug: 'window', name: 'window', type: 'select', label: 'Collection window', options: ['morning', 'afternoon', 'evening'] },
  ],
  echo: { field: 'customer', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#bakery-form',
    fill: {
      'input[name=customer]': 'Nadia Rossi',
      'input[name=bread]': '2 white, 1 wholemeal',
    },
    expectText: 'Nadia Rossi',
  },
  passwordField: null,
};

const jobBoard = {
  id: 'job-board',
  title: 'Apprenticeship job board',
  story: 'A board lists apprenticeships and accepts applications that are stored and shown back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/apply', kind: 'write', redirect: (ref) => `/application/${ref}` },
    { method: 'GET', path: '/application/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/jobs', kind: 'list' },
  ],
  fields: [
    { slug: 'applicant', name: 'applicant', type: 'text', label: 'Applicant name', autocomplete: 'name' },
    { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'email' },
    { slug: 'role', name: 'role', type: 'text', label: 'Role applied for' },
    { slug: 'statement', name: 'statement', type: 'textarea', label: 'Why you are a good fit' },
  ],
  echo: { field: 'applicant', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#application-form',
    fill: {
      'input[name=applicant]': 'Taylor Brooks',
      'input[name=email]': 'taylor@example.test',
      'input[name=role]': 'Heat pump installer',
      'textarea[name=statement]': 'I hold a plumbing NVQ',
    },
    expectText: 'Taylor Brooks',
  },
  passwordField: null,
};

const docsSite = {
  id: 'docs-site',
  title: 'Documentation site with data entry',
  story: 'A documentation site records a data entry and shows the saved record back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/submit', kind: 'write', redirect: (ref) => `/record/${ref}` },
    { method: 'GET', path: '/record/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/docs', kind: 'list' },
  ],
  fields: [
    { slug: 'author', name: 'author', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'plot', name: 'plot', type: 'text', label: 'Plot or reference' },
    { slug: 'measurement', name: 'measurement', type: 'number', label: 'Measured value', step: '0.1' },
  ],
  echo: { field: 'author', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#entry-form',
    fill: {
      'input[name=author]': 'Avery Quinn',
      'input[name=plot]': 'Plot 4',
      'input[name=measurement]': '6.8',
    },
    expectText: 'Avery Quinn',
  },
  passwordField: null,
};

const expenseTracker = {
  id: 'expense-tracker',
  title: 'Collective expense tracker',
  story: 'A collective logs expenses and shows the updated ledger entry back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/expenses', kind: 'write', redirect: (ref) => `/entry/${ref}` },
    { method: 'GET', path: '/entry/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/ledger', kind: 'list' },
  ],
  fields: [
    { slug: 'member', name: 'member', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'vendor', name: 'vendor', type: 'text', label: 'Vendor' },
    { slug: 'category', name: 'category', type: 'select', label: 'Category', options: ['maintenance', 'supplies', 'utilities', 'other'] },
    { slug: 'amount', name: 'amount', type: 'number', label: 'Amount', min: '0', step: '0.01' },
  ],
  echo: { field: 'member', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#expense-form',
    fill: {
      'input[name=member]': 'Casey Duval',
      'input[name=vendor]': 'Hardware shop',
      'input[name=amount]': '42.50',
    },
    expectText: 'Casey Duval',
  },
  passwordField: null,
};

const libraryCatalogue = {
  id: 'library-catalogue',
  title: 'Seed and cutting catalogue',
  story: 'A catalogue lists specimens and accepts a cutting request that is stored and shown back.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/request', kind: 'write', redirect: (ref) => `/voucher/${ref}` },
    { method: 'GET', path: '/voucher/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/catalogue', kind: 'list' },
  ],
  fields: [
    { slug: 'gardener', name: 'gardener', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'specimen', name: 'specimen', type: 'text', label: 'Specimen' },
    { slug: 'quantity', name: 'quantity', type: 'number', label: 'Quantity of cuttings' },
  ],
  echo: { field: 'gardener', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#request-form',
    fill: {
      'input[name=gardener]': 'Imogen Vale',
      'input[name=specimen]': 'Full-sun perennial',
      'input[name=quantity]': '3',
    },
    expectText: 'Imogen Vale',
  },
  passwordField: null,
};

const communityForum = {
  id: 'community-forum',
  title: 'Community forum with notes',
  story: 'A forum hosts entries and accepts a note that is stored and shown back to the author.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/notes', kind: 'write', redirect: (ref) => `/thread/${ref}` },
    { method: 'GET', path: '/thread/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/library', kind: 'list' },
  ],
  fields: [
    { slug: 'author', name: 'author', type: 'text', label: 'Your name', autocomplete: 'name' },
    { slug: 'entry', name: 'entry', type: 'text', label: 'Entry or tune' },
    { slug: 'note', name: 'note', type: 'textarea', label: 'Note or variation' },
  ],
  echo: { field: 'author', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#note-form',
    fill: {
      'input[name=author]': 'Owen Pryce',
      'input[name=entry]': 'The Blacksmith',
      'textarea[name=note]': 'Slower tempo suits the jig',
    },
    expectText: 'Owen Pryce',
  },
  passwordField: null,
};

const scrollStorytellingLaunch = {
  id: 'scroll-storytelling-launch',
  title: 'Scroll-driven hardware product launch & pre-order',
  story: 'An interactive acoustic product launch page presents chaptered specs, finish selection, and a persisted pre-order reservation.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/preorders', kind: 'write', redirect: (ref) => `/preorders/${ref}` },
    { method: 'GET', path: '/preorders/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/preorders', kind: 'list' },
  ],
  fields: [
    { slug: 'buyer', name: 'buyer', type: 'text', label: 'Full name', autocomplete: 'name' },
    { slug: 'email', name: 'email', type: 'email', label: 'Confirmation email', autocomplete: 'email' },
    { slug: 'finish', name: 'finish', type: 'select', label: 'Chassis finish', options: ['Anodised Obsidian', 'Raw Bead-Blasted Titanium', 'Warm Brushed Copper'] },
    { slug: 'earpads', name: 'earpads', type: 'select', label: 'Ear-pad material', options: ['Perforated Lambskin', 'Acoustic Micro-Suede'] },
    { slug: 'engraving', name: 'engraving', type: 'textarea', label: 'Headband engraving note' },
  ],
  echo: { field: 'buyer', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#aether-preorder-form',
    fill: {
      'input[name=buyer]': 'Clara Vance',
      'input[name=email]': 'clara.vance@aether-acoustics.example',
      'textarea[name=engraving]': 'Studio Reference Batch 04',
    },
    select: {
      'select[name=finish]': 'Warm Brushed Copper',
      'select[name=earpads]': 'Acoustic Micro-Suede',
    },
    expectText: 'Clara Vance',
  },
  passwordField: null,
};

const browserPuzzleGame = {
  id: 'browser-puzzle-game',
  title: 'Daily grid routing puzzle & streak leaderboard',
  story: 'A daily frequency-routing logic game records verified puzzle solutions, move counts, and spoiler-free notes to a persistent leaderboard.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/runs', kind: 'write', redirect: (ref) => `/runs/${ref}` },
    { method: 'GET', path: '/runs/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/leaderboard', kind: 'list' },
  ],
  fields: [
    { slug: 'callsign', name: 'callsign', type: 'text', label: 'Operator callsign', autocomplete: 'username' },
    { slug: 'moves', name: 'moves', type: 'number', label: 'Moves used' },
    { slug: 'routing_mode', name: 'routing_mode', type: 'select', label: 'Signal mode', options: ['Standard Par 14', 'Phase Splitter', 'Harmonic Lock'] },
    { slug: 'solution_summary', name: 'solution_summary', type: 'textarea', label: 'Route notes' },
  ],
  echo: { field: 'callsign', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#signal-run-form',
    fill: {
      'input[name=callsign]': 'Tamsin Kale',
      'input[name=moves]': '14',
      'textarea[name=solution_summary]': 'Phase splitter at D4 locked both receivers cleanly.',
    },
    select: {
      'select[name=routing_mode]': 'Phase Splitter',
    },
    expectText: 'Tamsin Kale',
  },
  passwordField: null,
};

const saasWorkspaceBoard = {
  id: 'saas-workspace-board',
  title: 'Keyboard-first sprint issue board & inspector',
  story: 'A hardware and firmware sprint workspace creates, inspects, filters, and updates engineering issues across board and table views.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/issues', kind: 'write', redirect: (ref) => `/issues/${ref}` },
    { method: 'GET', path: '/issues/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/issues', kind: 'list' },
  ],
  fields: [
    { slug: 'title', name: 'title', type: 'text', label: 'Issue title' },
    { slug: 'assignee', name: 'assignee', type: 'text', label: 'Assignee', autocomplete: 'name' },
    { slug: 'priority', name: 'priority', type: 'select', label: 'Priority', options: ['Normal', 'High', 'Urgent'] },
    { slug: 'component', name: 'component', type: 'select', label: 'Subsystem', options: ['PCB Layout', 'Firmware', 'Telemetry'] },
    { slug: 'repro_steps', name: 'repro_steps', type: 'textarea', label: 'Reproduction steps' },
  ],
  echo: { field: 'title', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#kestrel-issue-form',
    fill: {
      'input[name=title]': 'Fix SPI bus contention during flash write',
      'input[name=assignee]': 'Elena Rostova',
      'textarea[name=repro_steps]': 'Reflash controller; stream telemetry at 200Hz; observe SPI lock.',
    },
    select: {
      'select[name=priority]': 'High',
      'select[name=component]': 'Firmware',
    },
    expectText: 'Fix SPI bus contention during flash write',
  },
  passwordField: null,
};

const realtimeTelemetryDashboard = {
  id: 'realtime-telemetry-dashboard',
  title: 'Offshore wind telemetry & alert rule console',
  story: 'An operations telemetry console monitors sector generation, brushes time windows, and persists validated thermal alert rules to the incident audit log.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/alerts', kind: 'write', redirect: (ref) => `/alerts/${ref}` },
    { method: 'GET', path: '/alerts/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/incidents', kind: 'list' },
  ],
  fields: [
    { slug: 'turbine_id', name: 'turbine_id', type: 'select', label: 'Turbine unit', options: ['Turbine B-01', 'Turbine B-07', 'Turbine B-12'] },
    { slug: 'operator', name: 'operator', type: 'text', label: 'Duty engineer', autocomplete: 'name' },
    { slug: 'warning_temp', name: 'warning_temp', type: 'number', label: 'Warning threshold (°C)' },
    { slug: 'critical_temp', name: 'critical_temp', type: 'number', label: 'Critical threshold (°C)' },
    { slug: 'dispatch_note', name: 'dispatch_note', type: 'textarea', label: 'Incident annotation' },
  ],
  echo: { field: 'operator', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#northsea-alert-form',
    fill: {
      'input[name=operator]': 'Soren Lindqvist',
      'input[name=warning_temp]': '78',
      'input[name=critical_temp]': '88',
      'textarea[name=dispatch_note]': 'Gearbox oil excursion observed during 14:00 UTC gust window.',
    },
    select: {
      'select[name=turbine_id]': 'Turbine B-07',
    },
    expectText: 'Soren Lindqvist',
  },
  passwordField: null,
};

const interactiveProductConfigurator = {
  id: 'interactive-product-configurator',
  title: 'Custom bicycle configurator & live bill of materials',
  story: 'A workshop bicycle configurator checks tyre-and-mudguard clearance compatibility, updates the itemised bill of materials, and saves custom build reservations.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/builds', kind: 'write', redirect: (ref) => `/builds/${ref}` },
    { method: 'GET', path: '/builds/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/builds', kind: 'list' },
  ],
  fields: [
    { slug: 'rider', name: 'rider', type: 'text', label: 'Rider name', autocomplete: 'name' },
    { slug: 'frame_size', name: 'frame_size', type: 'select', label: 'Frame geometry', options: ['52cm Compact', '56cm Endurance', '58cm Tall'] },
    { slug: 'finish', name: 'finish', type: 'select', label: 'Titanium finish', options: ['Raw Brushed Ti', 'Anodised Bronze', 'Slate Cerakote'] },
    { slug: 'wheelset', name: 'wheelset', type: 'select', label: 'Wheelset & tyres', options: ['Alloy All-Road 700x38c', '40mm Deep Carbon Gravel', '650b Expedition Dynamo'] },
    { slug: 'build_notes', name: 'build_notes', type: 'textarea', label: 'Fit & routing notes' },
  ],
  echo: { field: 'rider', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#atelier-build-form',
    fill: {
      'input[name=rider]': 'Jules Moreau',
      'textarea[name=build_notes]': 'Internal dynamo wire routing through fork crown; 90mm stem.',
    },
    select: {
      'select[name=frame_size]': '56cm Endurance',
      'select[name=finish]': 'Anodised Bronze',
      'select[name=wheelset]': '40mm Deep Carbon Gravel',
    },
    expectText: 'Jules Moreau',
  },
  passwordField: null,
};

const developerMediaPlayground = {
  id: 'developer-media-playground',
  title: 'WebAudio synth & shader code playground',
  story: 'An interactive audio-synthesis and shader studio pairs live code editing with time-synced tutorial transcripts and persists exported patches.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/patches', kind: 'write', redirect: (ref) => `/patches/${ref}` },
    { method: 'GET', path: '/patches/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/patches', kind: 'list' },
  ],
  fields: [
    { slug: 'patch_name', name: 'patch_name', type: 'text', label: 'Patch title' },
    { slug: 'author', name: 'author', type: 'text', label: 'Creator handle', autocomplete: 'username' },
    { slug: 'synth_engine', name: 'synth_engine', type: 'select', label: 'Synth engine', options: ['Biquad Subtractive', 'FM Bell Operator', 'Karplus-Strong String'] },
    { slug: 'cutoff_hz', name: 'cutoff_hz', type: 'number', label: 'Filter cutoff (Hz)' },
    { slug: 'patch_source', name: 'patch_source', type: 'textarea', label: 'DSP patch expression' },
  ],
  echo: { field: 'patch_name', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#resonance-patch-form',
    fill: {
      'input[name=patch_name]': 'Warm Analog Filter Sweep',
      'input[name=author]': 'Devon Kestrel',
      'input[name=cutoff_hz]': '680',
      'textarea[name=patch_source]': 'filter.frequency.setValueAtTime(680, ctx.currentTime);',
    },
    select: {
      'select[name=synth_engine]': 'FM Bell Operator',
    },
    expectText: 'Warm Analog Filter Sweep',
  },
  passwordField: null,
};

const editorialBlog = {
  id: 'editorial-blog',
  title: 'Editorial publication & article composer',
  story: 'An independent material-arts journal publishes long-form essays with pull quotes and tag filtering, and persists new articles from its split-pane composer.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/articles', kind: 'write', redirect: (ref) => `/articles/${ref}` },
    { method: 'GET', path: '/articles/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/articles', kind: 'list' },
  ],
  fields: [
    { slug: 'headline', name: 'headline', type: 'text', label: 'Article headline' },
    { slug: 'byline', name: 'byline', type: 'text', label: 'Author byline', autocomplete: 'name' },
    { slug: 'section', name: 'section', type: 'select', label: 'Journal section', options: ['Studio Notes', 'Glaze Chemistry', 'Kiln Firing', 'Workshops'] },
    { slug: 'body_markdown', name: 'body_markdown', type: 'textarea', label: 'Essay body (Markdown)' },
  ],
  echo: { field: 'headline', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#kiln-article-form',
    fill: {
      'input[name=headline]': 'What a reduction firing does to a copper glaze',
      'input[name=byline]': 'Marguerite Ash',
      'textarea[name=body_markdown]': 'At cone 10 in a heavy reduction atmosphere, copper carbonate shifts from celadon green to oxblood red.',
    },
    select: {
      'select[name=section]': 'Glaze Chemistry',
    },
    expectText: 'What a reduction firing does to a copper glaze',
  },
  passwordField: null,
};

const fanCommunitySite = {
  id: 'fan-community-site',
  title: 'Fan craft archive & moderated contribution registry',
  story: 'A stop-motion animation craft registry lets fans browse canon artefacts, submit annotated contributions for moderation, and track review status.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/contributions', kind: 'write', redirect: (ref) => `/contributions/${ref}` },
    { method: 'GET', path: '/contributions/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/collection', kind: 'list' },
  ],
  fields: [
    { slug: 'artefact_title', name: 'artefact_title', type: 'text', label: 'Artefact title' },
    { slug: 'contributor', name: 'contributor', type: 'text', label: 'Contributor handle', autocomplete: 'username' },
    { slug: 'canon_section', name: 'canon_section', type: 'select', label: 'Canon section', options: ['Characters', 'Sets and Props', 'Ephemera', 'Interviews'] },
    { slug: 'provenance_notes', name: 'provenance_notes', type: 'textarea', label: 'Archival & lighting notes' },
  ],
  echo: { field: 'artefact_title', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#lantern-contribution-form',
    fill: {
      'input[name=artefact_title]': 'Harbour Street miniature sodium lamp rig',
      'input[name=contributor]': 'brasslamp',
      'textarea[name=provenance_notes]': 'Wired with 3V grain-of-wheat bulbs beneath hand-soldered brass hoods for Scene 14.',
    },
    select: {
      'select[name=canon_section]': 'Sets and Props',
    },
    expectText: 'Harbour Street miniature sodium lamp rig',
  },
  passwordField: null,
};

const productCardComparison = {
  id: 'product-card-comparison',
  title: 'Hardware specification comparison & rig selection board',
  story: 'A technical hardware benchmark catalogue compares multi-attribute cards side by side and carries the chosen component forward into a saved rig build.',
  routes: [
    { method: 'GET', path: '/', kind: 'page' },
    { method: 'POST', path: '/selections', kind: 'write', redirect: (ref) => `/selections/${ref}` },
    { method: 'GET', path: '/selections/:ref', kind: 'read-by-reference' },
    { method: 'GET', path: '/compare', kind: 'list' },
  ],
  fields: [
    { slug: 'builder_name', name: 'builder_name', type: 'text', label: 'Builder name', autocomplete: 'name' },
    { slug: 'card_model', name: 'card_model', type: 'select', label: 'Selected graphics card', options: ['Halcyon RX-7800 (16 GB)', 'Northwind Arc A770 (16 GB)', 'Vector VX-4070 (12 GB)'] },
    { slug: 'psu_wattage', name: 'psu_wattage', type: 'number', label: 'Power supply budget (W)' },
    { slug: 'rig_notes', name: 'rig_notes', type: 'textarea', label: 'Chassis & thermal notes' },
  ],
  echo: { field: 'builder_name', source: 'record' },
  journey: {
    startPath: '/',
    formSelector: 'form#rig-selection-form',
    fill: {
      'input[name=builder_name]': 'Gideon Park',
      'input[name=psu_wattage]': '750',
      'textarea[name=rig_notes]': 'Paired with 280mm mesh workstation chassis; 225W TDP within quiet fan curve.',
    },
    select: {
      'select[name=card_model]': 'Northwind Arc A770 (16 GB)',
    },
    expectText: 'Gideon Park',
  },
  passwordField: null,
};

export const TRAINING_ARCHETYPES = {
  booking,
  'web-shop': webShop,
  dashboard,
  'onboarding-auth': onboardingAuth,
  'directory-listing': directoryListing,
  'event-registration': eventRegistration,
  'support-helpdesk': supportHelpdesk,
  'course-enrolment': courseEnrolment,
  'survey-form': surveyForm,
  'restaurant-ordering': restaurantOrdering,
  'job-board': jobBoard,
  'docs-site': docsSite,
  'expense-tracker': expenseTracker,
  'library-catalogue': libraryCatalogue,
  'community-forum': communityForum,
  'scroll-storytelling-launch': scrollStorytellingLaunch,
  'browser-puzzle-game': browserPuzzleGame,
  'saas-workspace-board': saasWorkspaceBoard,
  'realtime-telemetry-dashboard': realtimeTelemetryDashboard,
  'interactive-product-configurator': interactiveProductConfigurator,
  'developer-media-playground': developerMediaPlayground,
  'editorial-blog': editorialBlog,
  'fan-community-site': fanCommunitySite,
  'product-card-comparison': productCardComparison,
};

export const TRAINING_ARCHETYPE_IDS = Object.freeze(Object.keys(TRAINING_ARCHETYPES));
