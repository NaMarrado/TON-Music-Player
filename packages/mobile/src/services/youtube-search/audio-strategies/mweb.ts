import { getPoToken } from '../../po-token-service';
import { getPlayerClient } from '../client';
import { MWEB_UA } from '../constants';
import type { ResolvedAudioUrl } from '../types';
import { isIosCompatibleAudioMimeType, toContentLength } from './format-helpers';

type StreamingFormat = {
  content_length?: number | string;
  itag?: number;
  mime_type?: string;
  url?: string;
};

export async function getAudioUrlViaMweb(videoId: string): Promise<ResolvedAudioUrl> {
  const token = await getPoToken({ binding: 'video', videoId });
  const yt = await getPlayerClient({
    cacheKey: `mweb:${videoId}:${token.poToken}`,
    poToken: token.poToken,
    visitorData: token.visitorData,
  });
  const format = await yt.getStreamingData(videoId, {
    client: 'MWEB',
    codec: 'mp4a',
    format: 'mp4',
    po_token: token.poToken,
    quality: 'best',
    type: 'audio',
  } as never) as StreamingFormat;

  if (!format.url) {
    throw new Error('MWEB player: missing final URL');
  }

  if (!new URL(format.url).searchParams.has('pot')) {
    throw new Error('MWEB player: missing GVS PO token');
  }

  const mimeType = format.mime_type || 'audio/mp4';
  if (!isIosCompatibleAudioMimeType(mimeType)) {
    throw new Error(`MWEB player: incompatible audio format (${mimeType})`);
  }

  console.log(
    '[YT-AUDIO] MWEB player success, itag:',
    format.itag,
    'mime:',
    mimeType,
  );

  return {
    url: format.url,
    mimeType,
    contentLength: toContentLength(format.content_length),
    headers: { 'User-Agent': MWEB_UA },
  };
}
