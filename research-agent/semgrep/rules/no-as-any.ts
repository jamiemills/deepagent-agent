declare const value: unknown;

// ok: typescript.no-as-any
const typedValue = value as string;

// ruleid: typescript.no-as-any
const anyValue = value as any;
