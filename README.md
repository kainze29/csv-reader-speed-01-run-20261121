# Fast CSV reader

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kainze29/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kainze29/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A from-scratch, dependency-free CSV reader written for the
[Read broken CSV files faster, 21 November 2026](https://make.fun/c/csv-reader-speed-01-run-20261121)
competition on make.fun. Its `run(input)` returns exactly the answer that
csv-reader 1.0.0 returns for the same input `{text, header}`, the JSON value
`{columns, rows, errors}`, byte for byte on every practice case, and it reads
a full set of 6 cases about 4x faster than csv-reader itself.

## How it works

`solve.js` is a single left-to-right pass over the text. Where csv-reader
1.0.0 reads one character at a time and grows each field with `value += c`,
this parser jumps from one delimiter to the next with `indexOf` and takes
each field as one slice of the input, so a plain field costs two short scans
and one slice and no per-character work at all. Only the rare broken paths
fall back to a segment-by-segment reader: a stray CR outside quotes, junk
after a closing quote, a quote that never closes, and a line break inside
quotes. Nothing is kept from one call to the next; every case is answered
alone.

The broken-row policy is csv-reader 1.0.0's, exactly: a leading U+FEFF is
dropped, a record ends at LF or CRLF, an empty line is no record, a CR
outside quotes that is not followed by LF is dropped (stray_cr), a quoted
field runs to the next non-doubled quote with CRLF and lone CR inside read
as LF, text after a closing quote is appended as it stands (quote_junk),
a quote that never closes is a literal character and the text after it is
read again as unquoted (unterminated_quote), and short and long rows are
padded or cut to the first record's width with short_row and long_row
errors carrying the field count or the cut fields.

## Files

- `solve.js`: the reader, a dependency-free ES module exporting `run`.
- `main.ts`: the driver the harness runs, reads `/input/cases.json` and
  writes `/output/answers.json`.
- `LICENSE`: MIT.

## License

MIT. See [LICENSE](LICENSE).
