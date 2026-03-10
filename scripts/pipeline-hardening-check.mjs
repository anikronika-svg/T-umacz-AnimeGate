// Lightweight non-UI hardening check for translation pipeline behavior.
// It validates: ordering, retry behavior, stop interruption, and resume completeness.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitDuringRun(ms, stopRef) {
  let remaining = ms;
  while (remaining > 0) {
    if (stopRef.current) throw new Error('cancelled');
    const slice = Math.min(20, remaining);
    await sleep(slice);
    remaining -= slice;
  }
}

function tokenizeSubtitleText(value) {
  const tokens = [];
  const regex = /(\{[^{}]*\}|\\N|\\n|\\h)/g;
  let last = 0;
  let m;
  while ((m = regex.exec(value)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: value.slice(last, m.index) });
    tokens.push({ type: 'tag', value: m[0] });
    last = regex.lastIndex;
  }
  if (last < value.length) tokens.push({ type: 'text', value: value.slice(last) });
  return tokens;
}

async function translatePreservingTags(sourceText, translator) {
  const tokens = tokenizeSubtitleText(sourceText);
  const out = [];
  for (const token of tokens) {
    if (token.type === 'tag' || !token.value.trim()) {
      out.push(token.value);
      continue;
    }
    out.push(await translator(token.value));
  }
  return out.join('');
}

function createRows(count) {
  const rows = [];
  for (let i = 1; i <= count; i += 1) {
    rows.push({
      id: i,
      sourceRaw: i % 7 === 0 ? '{\\i1}Hello\\Nworld{\\i0}' : `Line ${i}`,
      target: '',
    });
  }
  return rows;
}

async function runPipeline(rows, ids, options) {
  const {
    batchSize = 20,
    stopAtProcessed = Infinity,
    rateLimitedBatches = new Set(),
    maxBatchRetries = 2,
  } = options;

  const stopRef = { current: false };
  const statusById = new Map();
  const writesById = new Map();
  const outById = new Map(rows.map(r => [r.id, r.target]));
  const rowsById = new Map(rows.map(r => [r.id, r]));
  const requested = [...new Set(ids)];
  const batches = [];
  for (let i = 0; i < requested.length; i += batchSize) {
    batches.push(requested.slice(i, i + batchSize));
  }

  let processed = 0;

  async function translateChunk(text) {
    await sleep(1);
    return `PL:${text}`;
  }

  for (let bi = 0; bi < batches.length; bi += 1) {
    if (stopRef.current) break;
    const batch = batches[bi];

    let batchResult = null;
    for (let attempt = 0; attempt <= maxBatchRetries; attempt += 1) {
      if (rateLimitedBatches.has(bi) && attempt < maxBatchRetries) {
        await waitDuringRun(40, stopRef).catch(() => {
          stopRef.current = true;
        });
        if (stopRef.current) break;
        continue;
      }
      batchResult = [];
      for (const id of batch) {
        const row = rowsById.get(id);
        if (!row) continue;
        const translated = await translatePreservingTags(row.sourceRaw, translateChunk);
        batchResult.push([id, translated]);
      }
      break;
    }

    if (stopRef.current) break;

    if (batchResult) {
      for (const [id, tr] of batchResult) {
        outById.set(id, tr);
        statusById.set(id, 'done');
        writesById.set(id, (writesById.get(id) ?? 0) + 1);
        processed += 1;
        if (processed >= stopAtProcessed) {
          stopRef.current = true;
          break;
        }
      }
      if (stopRef.current) break;
      await waitDuringRun(30, stopRef).catch(() => {
        stopRef.current = true;
      });
      continue;
    }

    for (const id of batch) {
      if (stopRef.current) break;
      const row = rowsById.get(id);
      if (!row) continue;
      const translated = await translatePreservingTags(row.sourceRaw, translateChunk);
      outById.set(id, translated);
      statusById.set(id, 'done');
      writesById.set(id, (writesById.get(id) ?? 0) + 1);
      processed += 1;
      if (processed >= stopAtProcessed) {
        stopRef.current = true;
        break;
      }
    }
  }

  return { statusById, writesById, outById, stopRequested: stopRef.current };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const rows = createRows(180);
  const allIds = rows.map(r => r.id);

  // Run 1: simulate large file + rate-limit + stop.
  const first = await runPipeline(rows, allIds, {
    batchSize: 20,
    stopAtProcessed: 87,
    rateLimitedBatches: new Set([1, 2, 4]),
    maxBatchRetries: 2,
  });

  const doneFirst = [...first.statusById.values()].filter(v => v === 'done').length;
  assert(doneFirst === 87, `expected 87 processed in first run, got ${doneFirst}`);
  assert(first.stopRequested, 'stop should be requested in first run');

  // Ensure tags are preserved in translated output.
  const tagged = first.outById.get(7) ?? '';
  assert(tagged.includes('{\\i1}') && tagged.includes('{\\i0}') && tagged.includes('\\N'), 'ASS tags were not preserved');

  // Run 2: resume remaining IDs only.
  const remaining = allIds.filter(id => !first.statusById.has(id));
  const second = await runPipeline(
    rows.map(r => ({ ...r, target: first.outById.get(r.id) ?? '' })),
    remaining,
    { batchSize: 20, stopAtProcessed: Infinity, rateLimitedBatches: new Set([0]), maxBatchRetries: 2 },
  );

  const totalDone = doneFirst + [...second.statusById.values()].filter(v => v === 'done').length;
  assert(totalDone === allIds.length, `resume did not complete all lines: ${totalDone}/${allIds.length}`);

  // No duplicates within each run.
  const duplicatedFirst = [...first.writesById.values()].some(v => v > 1);
  const duplicatedSecond = [...second.writesById.values()].some(v => v > 1);
  assert(!duplicatedFirst && !duplicatedSecond, 'detected duplicate writes in a single run');

  // Ordering guard: ID -> translated line should match same ID source.
  for (const id of allIds.slice(0, 20)) {
    const val = (second.outById.get(id) ?? first.outById.get(id) ?? '');
    assert(val.length > 0, `missing output for id=${id}`);
    if (id % 7 !== 0) {
      assert(val.includes(`PL:Line ${id}`), `ordering mismatch for id=${id}`);
    }
  }

  console.log('PASS: large-file + rate-limit + stop + resume scenario is stable in simulation.');
  console.log(`PASS: processed total ${totalDone}/${allIds.length}, no duplicate writes, tags preserved.`);
}

main().catch(err => {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
