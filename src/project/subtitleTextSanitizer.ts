export function normalizeSemanticWhitespace(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeTranslationChunk(value: string): string {
  const leading = /^\s/.test(value)
  const trailing = /\s$/.test(value)
  const core = normalizeSemanticWhitespace(value)
  if (!core) return value
  return `${leading ? ' ' : ''}${core}${trailing ? ' ' : ''}`
}
