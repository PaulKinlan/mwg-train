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
    { slug: 'measurement', name: 'measurement', type: 'number', label: 'Measured value' },
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
    { slug: 'amount', name: 'amount', type: 'number', label: 'Amount' },
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
};

export const TRAINING_ARCHETYPE_IDS = Object.freeze(Object.keys(TRAINING_ARCHETYPES));
