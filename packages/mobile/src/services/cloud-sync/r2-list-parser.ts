function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function parseListBucketResult(
  xml: string,
): { keys: string[]; nextContinuationToken: string | null } {
  const keys = Array.from(
    xml.matchAll(/<Key>([^<]+)<\/Key>/g),
    (match) => decodeXmlText(match[1]),
  );
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    keys,
    nextContinuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  };
}
