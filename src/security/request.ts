/** The visitor IP: `cf-connecting-ip`, else the first `x-forwarded-for`, else `x-real-ip`. */
export function getRequestIP(headers: Headers): string {
  const value =
    headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || headers.get('x-real-ip') || ''
  return value.split(',')[0]?.trim() || ''
}

export function isHoneypotFilled(raw: Record<string, unknown>, fieldName: string): boolean {
  const value = raw[fieldName]
  const list = Array.isArray(value) ? value : [value]
  return list.some((v) => typeof v === 'string' && v.trim() !== '')
}
