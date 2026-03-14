/**
 * Cleans raw LLM output down to the translation text only.
 *
 * LLMs often surround the translation with preamble or explanations.
 * This normalizer strips all of it before the output reaches the quality guards.
 *
 * Handled patterns:
 *  - <think>…</think> blocks  (deepseek-r1 and reasoning models)
 *  - ```lang … ``` code fences
 *  - "Translation: …" / "Polish: …" / "Here is the translation:" labels
 *  - Multi-line outputs where line 1 is a preamble (ends with colon)
 *  - Trailing [note: …] / (explanation: …) blocks
 *  - Single-quote / double-quote / „ wrapping
 */
export function normalizeLlmOutput(raw: string): string {
  if (!raw) return ''
  let text = raw.trim()

  // 1. Strip <think>…</think> blocks (deepseek-r1, QwQ, other reasoning models)
  text = text.replace(/<think>[\s\S]*?<\/think>/gu, '').trim()
  if (!text) return ''

  // 2. Strip code fences  ```lang\n…\n```
  if (text.startsWith('```')) {
    text = text.replace(/^```[^\n]*\n?/u, '').replace(/\n?```$/u, '').trim()
  }

  // 3. Strip leading role/preamble labels
  //    Matches things like:
  //      "Translation: …", "Polish: …", "Here is the Polish translation: …",
  //      "Translated line: …", "Result: …", "Output: …"
  text = text.replace(
    /^(?:translation|polish|pl|polski|tłumaczenie|output|result|subtitle(?:s)?|translated?\s*(?:line|text|subtitle)?|here(?:'s|\s+is)(?:\s+the)?(?:\s+\w+){0,3})\s*[:\-]\s*/iu,
    '',
  ).trim()

  // 4. Multi-line output: if the first line ends with a colon (label) and more lines follow, drop it
  if (text.includes('\n')) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length >= 2 && lines[0]?.endsWith(':')) {
      text = lines.slice(1).join(' ').trim()
    }
  }

  // 5. Strip trailing notes / explanations appended after the translation
  //    e.g.  "Poczekaj! [Note: short line kept concise]"
  text = text
    .replace(/\s*[\[(](?:note|uwaga|tip|comment|context|explanation)[:\s][^\])]*[\])]?\s*$/iu, '')
    .trim()

  // 6. Strip wrapping quotes if the entire output is a single quoted string
  const quoteMatch = text.match(/^["'„«](.+)["'"»]$/su)
  if (quoteMatch?.[1]) {
    text = quoteMatch[1].trim()
  }

  return text.trim()
}
