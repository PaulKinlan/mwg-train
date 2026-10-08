/**
 * The evaluation control fixtures, as data.
 *
 * Two sets, both required before the corresponding endpoints can report anything:
 *
 *  - `already-modern/*` - the existing site each of the eight already-modern briefs is written
 *    against. The brief asks for one small change and says to leave everything else exactly as it is,
 *    so the fixture is the "before" and `src/eval/baseline.mjs` diffs a run's tree against it.
 *  - `repair/*` - the defective starter each sealed repair family is written against. The seeded
 *    defects are declared here as kit flags; `src/eval/defects.mjs` proves them by driving the app,
 *    not by reading the flags back.
 *
 * The fixtures are written from this file so the tree on disk is reproducible: `scripts/scaffold-
 * eval-projects.mjs` regenerates every project and its content hashes, and a mismatch fails the gate.
 * Nothing here imports the briefs; the briefs reference these projects by path, not the other way
 * round, so the sealed manifest stays the authority on what was promised.
 */

const exhibitAudio = (id) => `/media/${id}.mp3`;

export const FIXTURES = [
  // ---------------------------------------------------------------------------------------------
  // Already-modern baselines. Each is the pre-change state: the model must make exactly one change.
  // ---------------------------------------------------------------------------------------------
  {
    group: 'already-modern',
    project_id: 'cf-06',
    brief_id: 'cf-06',
    title: 'Museum audio guide',
    nav: [{ href: '/', label: 'Exhibits' }, { href: '/shortlist', label: 'Shortlist' }],
    seed: {
      exhibits: [
        { id: 'bronze-helmet', title: 'Bronze helmet', meta: 'Iron Age, room 2', body: 'A decorated bronze helmet found in a local field.', audio: exhibitAudio('bronze-helmet') },
        { id: 'wool-comb', title: 'Wool comb', meta: 'Roman, room 3', body: 'A bone comb used in textile work.', audio: exhibitAudio('wool-comb') },
      ],
      shortlist: [],
    },
    pages: [
      { path: '/', kind: 'list', heading: 'Exhibits', collection: 'exhibits', item: '/exhibits/:id' },
      { path: '/exhibits/:id', kind: 'detail', collection: 'exhibits', saveAction: '/shortlist', saveLabel: 'Save to shortlist' },
      { path: '/shortlist', kind: 'list', heading: 'Shortlist', collection: 'shortlist', empty: 'Nothing saved yet.' },
    ],
    saves: [{ path: '/shortlist', collection: 'exhibits', into: 'shortlist', success: '/shortlist' }],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-09',
    brief_id: 'cf-09',
    title: 'Village hall hire',
    nav: [{ href: '/', label: 'Home' }, { href: '/facilities', label: 'Facilities' }, { href: '/contact', label: 'Contact' }],
    seed: { enquiries: [] },
    pages: [
      { path: '/', kind: 'static', heading: 'Village hall hire', sections: ['A tidy hall in the centre of the village, available for parties, meetings and classes.'] },
      { path: '/facilities', kind: 'static', heading: 'Facilities', sections: ['Main hall seating 80 people.', 'Kitchen with serving hatch.', 'Accessible toilet and step-free entrance.'] },
      { path: '/contact', kind: 'form', heading: 'Contact', sections: ['Opening hours: 9am to 5pm', 'Phone: 01234 567800'], action: '/contact', collection: 'enquiries', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'Message', type: 'textarea', required: true }], success: '/contact' },
    ],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-12',
    brief_id: 'cf-12',
    title: 'Pet adoption',
    nav: [{ href: '/', label: 'Pets' }, { href: '/apply', label: 'Apply' }],
    seed: {
      pets: [
        { id: 'tabby', title: 'Tabby', meta: 'Cat · 3 years', body: 'A calm indoor cat who likes a quiet corner.' },
        { id: 'rex', title: 'Rex', meta: 'Dog · 5 years', body: 'A lively collie who needs a garden and long walks.' },
      ],
      applications: [],
    },
    pages: [
      { path: '/', kind: 'list', heading: 'Pets looking for a home', collection: 'pets', item: '/pets/:id' },
      { path: '/pets/:id', kind: 'detail', collection: 'pets' },
      { path: '/apply', kind: 'form', heading: 'Adoption application', action: '/apply', collection: 'applications', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone number', type: 'tel', required: true }], success: '/applications/:id' },
      { path: '/applications/:id', kind: 'record', heading: 'Application received', collection: 'applications', show: ['name', 'email', 'phone'] },
    ],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-15',
    brief_id: 'cf-15',
    title: 'Community cinema',
    nav: [{ href: '/', label: 'Films' }, { href: '/reserve', label: 'Reserve' }],
    seed: {
      films: [
        { id: 'the-lighthouse', title: 'The Lighthouse', meta: '12A · Sunday 2pm', body: 'Two keepers, one island, and a very long night.' },
        { id: 'salt-and-stone', title: 'Salt and Stone', meta: 'PG · Wednesday 7:30pm', body: 'A documentary about the harbour wall.' },
      ],
      reservations: [],
    },
    pages: [
      { path: '/', kind: 'list', heading: 'Films this month', collection: 'films', item: '/films/:id' },
      { path: '/films/:id', kind: 'detail', collection: 'films' },
      { path: '/reserve', kind: 'form', heading: 'Reserve seats', action: '/reserve', collection: 'reservations', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'film', label: 'Film', type: 'select', options: ['The Lighthouse', 'Salt and Stone'], required: true }], success: '/reserve' },
    ],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-18',
    brief_id: 'cf-18',
    title: 'Book swap shelf',
    nav: [{ href: '/', label: 'Shelf' }],
    seed: {
      books: [
        { id: 'the-catcher', title: 'The Catcher in the Rye', meta: 'J. D. Salinger', body: 'A hardback with a loose spine.' },
        { id: 'small-things', title: 'Small Things Like These', meta: 'Claire Keegan', body: 'A short novel, still in its dust jacket.' },
      ],
      reservations: [],
    },
    pages: [
      { path: '/', kind: 'list', heading: 'On the shelf', collection: 'books', item: '/books/:id' },
      { path: '/books/:id', kind: 'detail', collection: 'books', saveAction: '/books/:id/reserve', saveLabel: 'Reserve', saveFields: [{ name: 'name', label: 'Your name', type: 'text', required: true }] },
    ],
    saves: [{ path: '/books/:id/reserve', collection: 'books', into: 'reservations', success: '/' }],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-21',
    brief_id: 'cf-21',
    title: 'Orchard harvest map',
    nav: [{ href: '/', label: 'Orchard' }, { href: '/map', label: 'Map' }, { href: '/report', label: 'Report fruit' }],
    seed: {
      trees: [
        { id: 'apple-1', title: 'Apple tree', meta: 'Discovery', body: 'Near the north gate, planted in 2001.' },
        { id: 'pear-2', title: 'Pear tree', meta: 'Conference', body: 'Beside the bench, a heavy cropper.' },
      ],
      reports: [],
    },
    pages: [
      { path: '/', kind: 'list', heading: 'The orchard', collection: 'trees', item: '/trees/:id' },
      { path: '/map', kind: 'static', heading: 'Map', sections: ['The orchard map is drawn on the noticeboard by the gate.'] },
      { path: '/trees/:id', kind: 'detail', collection: 'trees' },
      { path: '/report', kind: 'form', heading: 'Report ripe fruit', action: '/report', collection: 'reports', fields: [{ name: 'tree', label: 'Tree', type: 'select', options: ['Apple tree', 'Pear tree'], required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }], success: '/' },
    ],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-23',
    brief_id: 'cf-23',
    title: 'Neighbourhood watch',
    nav: [{ href: '/', label: 'Home' }, { href: '/coordinators', label: 'Coordinators' }, { href: '/report', label: 'Report' }],
    seed: {
      coordinators: [
        { id: 'willow-close', title: 'Willow Close', meta: '01234 567890' },
        { id: 'oak-road', title: 'Oak Road', meta: '01234 567892' },
        { id: 'mill-lane', title: 'Mill Lane', meta: '01234 567894' },
      ],
      reports: [],
    },
    pages: [
      { path: '/', kind: 'static', heading: 'Neighbourhood watch', sections: ['A non-urgent reporting scheme run by residents.'] },
      { path: '/coordinators', kind: 'list', heading: 'Street coordinators', collection: 'coordinators' },
      { path: '/report', kind: 'form', heading: 'Report something', action: '/report', collection: 'reports', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'street', label: 'Street', type: 'text', required: true }, { name: 'details', label: 'Details', type: 'textarea', required: true }], success: '/' },
    ],
    defects: [],
  },
  {
    group: 'already-modern',
    project_id: 'cf-25',
    brief_id: 'cf-25',
    title: 'Community radio schedule',
    nav: [{ href: '/', label: 'Home' }, { href: '/schedule', label: 'Schedule' }],
    seed: {
      programmes: [
        { id: 'mon-morning', title: 'The Morning Show', meta: 'Monday 09:00', body: 'Music, weather and the village diary.' },
        { id: 'wed-evening', title: 'Folk and Roots', meta: 'Wednesday 19:00', body: 'Two hours of local folk.' },
      ],
      presenters: [
        { id: 'jo-bloggs', title: 'Jo Bloggs', meta: 'The Morning Show' },
        { id: 'sam-price', title: 'Sam Price', meta: 'Folk and Roots' },
      ],
      alerts: [],
    },
    pages: [
      { path: '/', kind: 'form', heading: 'Community radio', sections: ['Programme alerts by email.'], action: '/alerts', collection: 'alerts', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }], success: '/' },
      { path: '/schedule', kind: 'list', heading: 'Schedule', collection: 'programmes' },
    ],
    defects: [],
  },

  // ---------------------------------------------------------------------------------------------
  // Repair starters. Each carries exactly the seeded defects its family names, and no others.
  // ---------------------------------------------------------------------------------------------
  {
    group: 'repair',
    project_id: 'fam-r02',
    family_id: 'fam-r02',
    title: 'Community fun run registration',
    defects: ['skip-required', 'border-only-error', 'no-persistence'],
    nav: [{ href: '/', label: 'Home' }, { href: '/register', label: 'Register' }],
    seed: { registrations: [] },
    pages: [
      { path: '/', kind: 'static', heading: 'Community fun run', sections: ['A 5km run through the park, open to all ages.'] },
      { path: '/register', kind: 'form', heading: 'Register', action: '/register', collection: 'registrations', fields: [{ name: 'name', label: 'Runner name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'ticket', label: 'Ticket', type: 'select', options: ['standard', 'accessible', 'student'], required: true }], success: '/registrations/:id' },
      { path: '/registrations/:id', kind: 'record', heading: 'Registration confirmed', collection: 'registrations', show: ['name', 'email', 'ticket'] },
    ],
    defects_note: 'skip-required: Enter in any field posts a half-filled form. border-only-error: a bad email is rejected but only shown by a red border. no-persistence: the confirmation is never stored.',
  },
  {
    group: 'repair',
    project_id: 'fam-r03',
    family_id: 'fam-r03',
    title: "Treasurer's expense ledger",
    defects: ['browser-only-totals', 'no-keyboard-widget', 'accept-negative'],
    nav: [{ href: '/', label: 'Home' }, { href: '/ledger', label: 'Ledger' }, { href: '/expenses/new', label: 'New expense' }],
    seed: { expenses: [] },
    pages: [
      { path: '/', kind: 'static', heading: 'Expense ledger', sections: ['For the treasurer of a small group.'] },
      { path: '/ledger', kind: 'list', heading: 'Ledger', collection: 'expenses', item: '/expenses/:id', total: { field: 'amount' }, empty: 'No expenses recorded.' },
      { path: '/expenses/new', kind: 'form', heading: 'New expense', action: '/expenses/new', collection: 'expenses', fields: [{ name: 'description', label: 'Description', type: 'text', required: true }, { name: 'spent_on', label: 'Date', type: 'date', required: true }, { name: 'amount', label: 'Amount', type: 'number', min: 0, widget: 'custom', options: ['0', '10', '20'] }], success: '/expenses/:id' },
      { path: '/expenses/:id', kind: 'record', heading: 'Expense recorded', collection: 'expenses', show: ['description', 'spent_on', 'amount'] },
    ],
    defects_note: 'browser-only-totals: the ledger total is worked out by a script and is gone on reload. no-keyboard-widget: the amount field is an unlabelled div combobox. accept-negative: a negative amount is stored without complaint.',
  },
];

export const FIXTURE_IDS = FIXTURES.map((fixture) => fixture.project_id);

export function fixturePath(fixture) {
  return `docs/eval/projects/${fixture.group}/${fixture.project_id}`;
}
