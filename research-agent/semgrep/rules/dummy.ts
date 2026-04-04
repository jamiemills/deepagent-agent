function semgrep_dummy_never_match(_value: string): number {
  return _value.length;
}

// ruleid: dummy.never-match
semgrep_dummy_never_match("fixture");
