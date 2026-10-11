/**
 * The wiki specification used by both the capability's test suite and its browser check, so the two cannot
 * drift: `test/wiki-capability.test.mjs` proves the spec gate and the seven arms over HTTP, and
 * `scripts/verify-wiki.mjs` drives the same project in a real browser (mwg-train-suu).
 *
 * The scenario is a community garden's field guide, and it is shaped so that **history changes what the page
 * tells you to do**: the soil page first advised adding lime, and a later revision withdraws that advice
 * because the readings in the plot are already alkaline. So an older revision is not a shorter version of the
 * current one, it is a different recommendation - which is what makes "tell the two apart" a real assertion
 * rather than a version number in a corner. The vocabulary is the corpus's own: the search must find a page by
 * a word that appears only in its body, and the corpus links to a page (`leaf-mould`) that nobody has written
 * yet, because a wiki's characteristic state is a link to a page that does not exist.
 */
import { specForFamily } from '../../src/eval/spec.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

export function wikiSpec(overrides = {}) {
  const base = specForFamily('booking', ROOT);
  return {
    ...base,
    family_id: 'garden-field-guide',
    title: 'Garden field guide',
    story: 'A gardener searches the guide for advice, reads a page, follows a link to a related one, and checks what the page used to say.',
    routes: [
      { method: 'GET', path: '/', kind: 'page', effect: 'introduce the guide and link to the corpus' },
      { method: 'POST', path: '/notes', kind: 'write', redirect: '/notes/:ref', effect: 'record a note against a page' },
      { method: 'GET', path: '/notes/:ref', kind: 'read-by-reference', effect: 'render one recorded note' },
    ],
    echo: { field: 'gardener', container: '#note-echo', route: 'read-by-reference' },
    session: false,
    capabilities: { ...base.capabilities, wiki: true },
    wiki: {
      pages: [
        {
          slug: 'soil',
          title: 'Soil',
          revisions: [
            {
              body: 'Our soil is heavy and holds water. If growth is slow, add lime in spring - that was the advice in the first edition of this guide. See [[clay]] and [[compost]].',
              author: 'Ada Lovelace',
              created_at: '2026-01-12T09:00:00.000Z'
            },
            {
              body: 'Our soil is heavy and holds water. Do not add lime: the readings from the four beds are already alkaline, and liming them made it worse in 2025. Layer [[compost]] instead, and see [[clay]] for the beds that drain badly.',
              author: 'Grace Hopper',
              created_at: '2026-04-02T14:30:00.000Z'
            }
          ]
        },
        {
          slug: 'clay',
          title: 'Clay soil',
          revisions: [
            {
              body: 'Clay is fine-grained and slow to drain. Fork it in autumn and leave the surface rough through the frost. See [[soil]].',
              author: 'Ada Lovelace',
              created_at: '2026-01-20T09:15:00.000Z'
            },
            {
              body: 'Clay is fine-grained and slow to drain. Fork it in autumn, leave the surface rough through the frost, and work in [[leaf-mould]] before planting - there is no page for that yet, so nobody has written down where we get it. See [[soil]].',
              author: 'Grace Hopper',
              created_at: '2026-02-18T16:45:00.000Z'
            }
          ]
        },
        {
          slug: 'compost',
          title: 'Compost',
          revisions: [
            {
              body: 'Compost here is kitchen waste and the shreddings from the hedge. Turn it weekly and keep it as damp as a wrung-out cloth. See [[soil]] and [[clay]].',
              author: 'Alan Turing',
              created_at: '2026-03-05T11:00:00.000Z'
            }
          ]
        }
      ]
    },
    ...overrides
  };
}
