/**
 * The pilot's archetypes: five server-backed flows, as data.
 *
 * Design brief section 1.2 asks for one to three executable journeys per project *with server
 * behaviour in every archetype* - SSR or server routes, persistence in an ephemeral SQLite database,
 * validation and error responses, search/filter, sessions, and simulated checkout rather than real
 * payment. Each archetype here therefore declares:
 *
 *   routes   - the server contract, including one route that writes to SQLite and one that reads it
 *              back by a server-issued reference, so the reload journey is a persistence test
 *   fields   - the form's fields, which drive both the markup and the autofill/validation rules
 *   echo     - the field whose text is shown back to the user. Every archetype has one: it is where
 *              the sanitisation rule is observable, and it is the reason a "static page" cannot pass
 *   journey  - the server-persistence journey the harness drives
 *
 * `defects` is the authoring contract: which MWG rules this project's original violates. The
 * scaffolder writes the defect into the code, and the pilot measures whether the uplift tool
 * actually removes it. A project lists only defects the tool claims to fix; projects whose original
 * is clean, or whose only defect is outside the tool's rule set, are listed in the plan as such.
 */

const deliveryAddress = {
  slug: 'address',
  name: 'address',
  type: 'text',
  label: 'Delivery address',
  pattern: '<input[^>]*name="address"[^>]*>',
  autocomplete: 'street-address',
};

// The autofill-address guide is measured on a street line *and* a postcode, so an archetype that
// claims the rule has to ask for both: a rule cannot be credited for a deliverable the project never
// asked the user for.
const deliveryPostcode = {
  slug: 'postcode',
  name: 'postcode',
  type: 'text',
  label: 'Postcode',
  autocomplete: 'postal-code',
};

export const ARCHETYPES = {
  booking: {
    id: 'booking',
    title: 'Evening class booking',
    story: 'A training centre takes bookings for evening classes and shows the booking back to the student.',
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'POST', path: '/book', kind: 'write', redirect: (ref) => `/booking/${ref}` },
      { method: 'GET', path: '/booking/:ref', kind: 'read-by-reference' },
      { method: 'GET', path: '/roster', kind: 'list' },
    ],
    fields: [
      { slug: 'name', name: 'name', type: 'text', label: 'Full name', autocomplete: 'name' },
      { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'username' },
      deliveryAddress,
      deliveryPostcode,
      { slug: 'notes', name: 'notes', type: 'textarea', label: 'Anything we should know?', echoed: true },
    ],
    echo: { field: 'notes', container: '#booking-notes', route: 'read-by-reference' },
    journey: {
      startPath: '/',
      formSelector: 'form#booking-form',
      fill: { 'input[name=name]': 'Ada Lovelace', 'input[name=email]': 'ada@example.test', 'input[name=address]': '12 Bridge Row', 'input[name=postcode]': 'AB1 2CD', 'textarea[name=notes]': 'Window seat please' },
      expectText: 'Ada Lovelace',
    },
    passwordField: null,
  },

  'contact-lead': {
    id: 'contact-lead',
    title: 'Public-service enquiry form',
    story: 'A council service takes enquiries, validates them, and shows the enquirer their reference.',
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'POST', path: '/enquiry', kind: 'write', redirect: (ref) => `/enquiry/${ref}` },
      { method: 'GET', path: '/enquiry/:ref', kind: 'read-by-reference' },
      { method: 'GET', path: '/inbox', kind: 'list' },
    ],
    fields: [
      { slug: 'name', name: 'name', type: 'text', label: 'Your name', autocomplete: 'name' },
      { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'email' },
      { slug: 'message', name: 'message', type: 'textarea', label: 'How can we help?', echoed: true },
    ],
    echo: { field: 'message', container: '#enquiry-message', route: 'read-by-reference' },
    journey: {
      startPath: '/',
      formSelector: 'form#enquiry-form',
      fill: { 'input[name=name]': 'Grace Hopper', 'input[name=email]': 'grace@example.test', 'textarea[name=message]': 'Please repair the street light' },
      expectText: 'Grace Hopper',
    },
    passwordField: null,
  },

  catalogue: {
    id: 'catalogue',
    title: 'Searchable reference catalogue',
    story: 'A parts catalogue with server-side search, paging and a session cart.',
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'GET', path: '/search', kind: 'search' },
      { method: 'POST', path: '/cart', kind: 'write-session', redirect: () => '/cart' },
      { method: 'GET', path: '/cart', kind: 'read-session' },
    ],
    fields: [
      { slug: 'query', name: 'q', type: 'search', label: 'Search parts', echoed: true },
      // Optional, and deliberately so: the uplift tool must not mark a field required that the project
      // never asked for, and a required-but-unfilled field made the browser refuse the journey's submit.
      { slug: 'quantity', name: 'quantity', type: 'number', label: 'Quantity', optional: true },
      // A real, fillable field rather than a hidden constant: the write journey generates a unique part
      // number per attempt, so the read-back can only be satisfied by this POST.
      { slug: 'item', name: 'item', type: 'text', label: 'Part number' },
    ],
    // This archetype's echoed value is the query the user typed, reflected by the server-rendered
    // search page. Its journey is therefore a GET that reloads, not a POST that redirects: the pilot
    // covers both server-journey shapes rather than assuming every archetype is a form submission.
    echo: { field: 'query', source: 'query', param: 'q' },
    // Two forms, because this archetype genuinely has two actions: a search (a GET that renders results)
    // and adding to a cart (a POST that writes). The pilot drives both, so this project has a real
    // server write journey like the other twenty-four, and the reflected-query journey on top of it.
    form: { method: 'get', action: '/search', fields: ['query'] },
    extraForm: { id: 'cart-form', method: 'post', action: '/cart', fields: ['item', 'quantity'], submit: 'Add to cart' },
    writeJourney: {
      startPath: '/',
      formSelector: 'form#cart-form',
      // Generated per attempt by the harness (see driveWriteJourney): a fixed value can be satisfied by
      // a row that was already stored, so the read-back would prove nothing about this POST.
      itemField: 'input[name=item]',
      fill: { 'input[name=quantity]': '2' },
      readPath: '/api/records',
    },
    journey: {
      kind: 'get-query-reload',
      startPath: '/',
      formSelector: 'form#search-form',
      fill: { 'input[name=q]': 'bearing' },
      expectText: 'bearing',
    },
    session: true,
    passwordField: null,
  },

  'account-recovery': {
    id: 'account-recovery',
    title: 'Account sign-in and recovery',
    story: 'Sign-up, sign-in with a server session, and a password-reset request.',
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'POST', path: '/signup', kind: 'write-account', redirect: () => '/account' },
      { method: 'GET', path: '/account', kind: 'read-session' },
      { method: 'POST', path: '/reset', kind: 'write-reset', redirect: (ref) => `/reset/${ref}` },
      { method: 'GET', path: '/reset/:ref', kind: 'read-by-reference' },
    ],
    fields: [
      { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'username' },
      // A recovery form sets a new password, so its token is new-password. Without it a project with no
      // seeded defects still failed the sign-up autofill rule, which meant the clean arm was not clean.
      { slug: 'password', name: 'password', type: 'password', label: 'Password', autocomplete: 'new-password' },
      { slug: 'displayName', name: 'displayName', type: 'text', label: 'Display name', echoed: true },
    ],
    // This archetype's answer is held by the session the server issued, not by a record reference.
    echo: { field: 'displayName', source: 'session' },
    journey: {
      startPath: '/',
      formSelector: 'form#signup-form',
      fill: { 'input[name=email]': 'alan@example.test', 'input[name=password]': 'correct horse battery', 'input[name=displayName]': 'Alan T' },
      expectText: 'Alan T',
    },
    securityJourney: { path: '/', formSelector: 'form#signup-form', fill: {} },
    session: true,
  },

  'event-registration': {
    id: 'event-registration',
    title: 'Event registration with capacity',
    story: 'Registration for a limited-capacity event, with a server-enforced waitlist.',
    routes: [
      { method: 'GET', path: '/', kind: 'page' },
      { method: 'POST', path: '/register', kind: 'write-with-capacity', redirect: (ref) => `/registration/${ref}` },
      { method: 'GET', path: '/registration/:ref', kind: 'read-by-reference' },
      { method: 'GET', path: '/attendees', kind: 'list' },
    ],
    fields: [
      { slug: 'name', name: 'name', type: 'text', label: 'Attendee name', echoed: true },
      { slug: 'email', name: 'email', type: 'email', label: 'Email', autocomplete: 'email' },
      { slug: 'ticket', name: 'ticket', type: 'select', label: 'Ticket', options: ['standard', 'accessible', 'student'] },
    ],
    echo: { field: 'name', container: '#attendee-name', route: 'read-by-reference' },
    journey: {
      startPath: '/',
      formSelector: 'form#registration-form',
      fill: { 'input[name=name]': 'Katherine Johnson', 'input[name=email]': 'kj@example.test' },
      expectText: 'Katherine Johnson',
    },
    capacity: 3,
    passwordField: null,
  },
};

export const ARCHETYPE_IDS = Object.freeze(Object.keys(ARCHETYPES));
