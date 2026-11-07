# ZIP compatibility fixtures

These small archives were generated independently of fflate on 2026-11-07. Tests read the committed bytes, so Python and .NET are not test dependencies.

| File | Producer | Coverage |
| --- | --- | --- |
| `python-stored.zip` | Python 3.13.13 `zipfile`, `ZIP_STORED`, seekable `BytesIO` | Stored payloads, archive comment, UTF-8 names |
| `python-streaming-deflate.zip` | Python 3.13.13 `zipfile`, `ZIP_DEFLATED`, non-seekable `BytesIO` | Data descriptors, Deflate, archive comment, UTF-8 names |
| `dotnet-deflate.zip` | .NET 10.0.13 `System.IO.Compression.ZipArchive`, `Optimal`, UTF-8 | Independent Deflate writer, empty directory, UTF-8 names |

All entries use the timestamp `2020-01-01 00:00:00`. Their names and UTF-8 contents, in order, are:

```json
{
  "empty/": "",
  ".gitignore": "ignored.txt\n",
  "ignored.txt": "ignored",
  "src/中文.txt": "hello",
  "src/.gitignore": "drop.txt\n",
  "src/drop.txt": "dropped"
}
```

The Python archives have the ASCII comment `dir-tree compatibility fixture`. The streaming writer overrides `seek()` to raise `io.UnsupportedOperation` and `seekable()` to return `False`, causing `zipfile` to write data descriptors. The .NET writer uses a seekable `MemoryStream`, calls `CreateEntry()` in the listed order, sets each entry's `LastWriteTime`, and writes the UTF-8 bytes directly without a BOM.

Existing generated tests separately cover GBK names, Unicode path extra fields, duplicate names, corrupted records, and unsupported formats. These three fixtures do not imply support for ZIP64, encryption, or compression methods other than Stored and Deflate.
