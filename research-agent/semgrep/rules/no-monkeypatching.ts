function safeLocalAssignment(): number {
  const localCounter = 1;
  return localCounter + 1;
}

// ok: runtime.no-monkeypatching
safeLocalAssignment();

// ruleid: runtime.no-monkeypatching
Array.prototype.map = function patchedMap() {
  return [];
};

// ruleid: runtime.no-monkeypatching
Object.defineProperty(Date.prototype, "toISOString", {
  value() {
    return "patched";
  },
});

// ruleid: runtime.no-monkeypatching
globalThis.fetch = async function patchedFetch() {
  return new Response("patched");
};

// ruleid: runtime.no-monkeypatching-builtins
Date.now = function patchedNow() {
  return 0;
};
