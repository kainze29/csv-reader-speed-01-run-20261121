// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers as csv-reader 1.0.0 on every input, built from scratch as a
// single left-to-right pass. Where the reference reads one character at a
// time and grows each field with `value += c`, this parser jumps from one
// delimiter to the next with indexOf and takes each field as one slice of
// the input, so a plain field costs two short scans and one slice and no
// per-character work at all. Only the rare broken paths (a stray CR, junk
// after a closing quote, a quote that never closes, a line break inside
// quotes) fall back to a segment-by-segment reader. No state is kept from
// one call to the next; every run(input) answers alone.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The next comma, CR or LF at or after pos, found by one regex scan.
  const delim = /[,\r\n]/g;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break, from the current pos: a CR not followed by LF is dropped and
  // reported (stray_cr). Returns {value, ended, added}, where added counts
  // the characters kept. Used only by the rare paths: a stray CR inside an
  // otherwise plain field, junk after a closing quote, and a quote that
  // never closes. The hot plain-field path is inlined in the record loop.
  function readUnquoted(value, recordLine, recordRow) {
    let added = 0;
    for (;;) {
      delim.lastIndex = pos;
      const m = delim.exec(text);
      if (m === null) {
        if (pos < n) {
          value += text.slice(pos);
          added += n - pos;
          pos = n;
        }
        return { value, ended: END, added };
      }
      const i = m.index;
      const dc = text.charCodeAt(i);
      if (dc === 44) {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (dc === 10) {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (text.charCodeAt(i + 1) === 10) {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = i + 1;
    }
  }

  while (true) {
    // Lines left with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;

    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        // A field that opens with a quote runs to the next quote that is
        // not doubled. "" inside it is one quote; each CRLF or lone CR
        // inside it is read as LF and counts as a line.
        const open = pos;
        const openLine = line;
        pos += 1;
        let value = '';
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', pos);
          if (q === -1) break;
          const seg = text.slice(pos, q);
          if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
            value += seg;
          } else {
            const parts = seg.split(/\r\n|\r|\n/);
            line += parts.length - 1;
            value += parts.join('\n');
          }
          if (text.charCodeAt(q + 1) === 34) {
            value += '"';
            pos = q + 2;
            continue;
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const r = readUnquoted('"', recordLine, recordRow);
          fields.push(r.value);
          ended = r.ended;
          continue;
        }
        if (pos >= n) {
          fields.push(value);
          ended = END;
          continue;
        }
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          fields.push(value);
          ended = COMMA;
        } else if (c === 10) {
          pos += 1;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
        } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
        } else {
          // What follows the closing quote is appended as it stands, up
          // to the next comma or line break.
          const junk = readUnquoted(value, recordLine, recordRow);
          if (junk.added > 0) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
          fields.push(junk.value);
          ended = junk.ended;
        }
      } else {
        // Plain field: the next comma or LF ends it (whichever is first);
        // a CR inside the slice is a stray CR, except a CR right before
        // the LF, which is half of a CRLF line break.
        const ci = text.indexOf(',', pos);
        const li = text.indexOf('\n', pos);
        if (ci === -1 && li === -1) {
          // No delimiter left: the field runs to the end of the text.
          let seg = pos < n ? text.slice(pos) : '';
          pos = n;
          if (seg.indexOf('\r') !== -1) {
            const parts = seg.split('\r');
            for (let k = 1; k < parts.length; k++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            seg = parts.join('');
          }
          fields.push(seg);
          ended = END;
        } else {
          const isComma = ci !== -1 && (li === -1 || ci < li);
          const i = isComma ? ci : li;
          let seg = text.slice(pos, i);
          if (seg.indexOf('\r') !== -1) {
            if (!isComma && seg.charCodeAt(seg.length - 1) === 13) {
              seg = seg.slice(0, -1);
            }
            if (seg.indexOf('\r') !== -1) {
              const parts = seg.split('\r');
              for (let k = 1; k < parts.length; k++) {
                errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              }
              seg = parts.join('');
            }
          }
          fields.push(seg);
          pos = i + 1;
          if (isComma) {
            ended = COMMA;
          } else {
            line += 1;
            ended = LINE_BREAK;
          }
        }
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
