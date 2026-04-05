const safeValue = 1;

// ok: hygiene.no-suppression-comments-slash
const nextValue = safeValue + 1;

// ruleid: hygiene.no-suppression-comments-slash
// eslint-disable-next-line no-console
console.log(nextValue);

// ruleid: hygiene.no-suppression-comments-slash
// @ts-ignore
const ignoredValue: string = 1;

// ruleid: hygiene.no-suppression-comments-slash
/* biome-ignore lint/suspicious/noExplicitAny: fixture */
const _bypassed: any = ignoredValue;
