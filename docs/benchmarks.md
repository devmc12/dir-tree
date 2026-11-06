# Reader benchmarks

Run the built package against the same generated fixtures on each revision:

```bash
npm run build
node --expose-gc scripts/benchmark-reader.mjs
```

The script checks results and reports the median of five runs. The ZIP fixture uses a 128,057-byte archive in a `Blob`, 800 ordinary files of 32 KiB each in 20 directories, an excluded file, and a root `.gitignore`. Repeated reads reuse the adapter and change the sort order. The annotation run applies 500 patches to 2,000 existing entries. The tree edit renames one file and retains the full tree copy.

Local comparison on November 7, 2026, Windows x64, Node.js 22.22.2. The baseline is `aa9973c`, before the read optimization. The after column uses the same fixture and process settings after the change.

| Operation | Before (ms) | After (ms) | Before ArrayBuffer delta (MiB) | After ArrayBuffer delta (MiB) |
| --- | --: | --: | --: | --: |
| First ZIP read | 110.13 | 30.38 | 25.62 | 0.37 |
| Repeat ZIP read | 93.71 | 26.70 | 24.07 | 0.00 |
| Apply annotation batch | 390.64 | 1.21 | 0.00 | 0.00 |
| Rename tree node | 0.25 | 0.22 | 0.00 | 0.00 |

Median process RSS deltas for first and repeat ZIP reads were 29.52 and 28.75 MiB before, and 3.27 and 2.64 MiB after. These are memory snapshots around each operation, not peak usage. ZIP results are for this archive and machine; the unchanged tree editing algorithm is included as a baseline for future work.
