const archetype = {};
const caps = {};
const out = `  ${archetype.journey?.update ? `const payload = JSON.parse(row.payload);` : `${caps.detail_page ? `return c.html(detailPage(row));` : `return c.html(renderDocument({ title: 'Your submission' }));`}`}`;
console.log(out);
