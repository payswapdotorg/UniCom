# W3-023 — the REAL-dist regression fixture provenance

The `real-dist-regression-fixture.txt` carries 8 manifest lines distilled
from the canonical build's CI evidence.

## Provenance

- **Source:** the 5 unclassifiable-path lines carry digests verbatim from
  the canonical build CI evidence (run 38259561304, commit 29f037d, 6,204
  files; extracted by the TL from dist-manifest-sha256.txt).
- **The .bcmap line** represents the 168-file class
  (pdfjs/cmaps/*.bcmap — one real line stands for the class).
- **The index.html + CommerceHostApp CSS lines** are also verbatim from
  the same manifest (representative classifiable lines).

## The one non-CI-verbatim line

The `index-Dy7vK8jN.js` line is a representative classifiable line from
the committed `dist-manifest-fixture.txt` (NOT a real CI digest — it
exists to satisfy the source→dist cross-check, which requires ≥1
js-entrypoint artifact so the contract-barrel/runtime-module/
projection-module source classes map to a dist class). It is the only
non-CI-verbatim line in the fixture; all 5 real-evidence lines carry
their real digests.

## W1-025 note

The fixture's comment lines were removed (W1-025 closed deviation #2:
unparseable lines are now counted + named, never silently dropped — the
`#` comments were previously silently skipped, which violated the parse
integrity law). The provenance documentation now lives in this companion
file. The fixture is now a pure sha256sum-format file (8 manifest lines,
no comments).
