import type { CloudR2ObjectInfo } from '@ton/core';

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function parseListBucketResult(xml: string): {
  objects: CloudR2ObjectInfo[];
  nextContinuationToken: string | null;
} {
  const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g), (match) => {
    const keyMatch = match[1].match(/<Key>([^<]+)<\/Key>/);
    const sizeMatch = match[1].match(/<Size>(\d+)<\/Size>/);
    return keyMatch
      ? { key: decodeXmlText(keyMatch[1]), size: Number(sizeMatch?.[1] ?? 0) }
      : null;
  }).filter((object): object is CloudR2ObjectInfo => object != null);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    objects,
    nextContinuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  };
}
