export function normalizeLlmOutput(raw: string): string {
  if (!raw) return ''
  let text = raw.trim()

  // Strip code fences
  const fenceMatch = text.match(/^```[\s\S]*?```$/u)
  if (fenceMatch) {
    text = text.replace(/^```[\s\S]*?\n/u, '').replace(/```$/u, '').trim()
  }

  // Remove leading labels like "Translation:" or "Polish:"
  text = text.replace(/^(translation|polish|pl|polski|tłumaczenie|output|result)\s*[:\-]\s*/iu, '')

  // Strip wrapping quotes if the whole output is quoted
  const quoteMatch = text.match(/^["'„«](.*)["'”»]$/u)
  if (quoteMatch) {
    text = quoteMatch[1]?.trim() ?? text
  }

  return text.trim()
}
