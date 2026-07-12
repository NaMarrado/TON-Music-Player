import { Parser, Platform, YTNodes } from 'youtubei.js';
import { evaluatePlayerScript } from '../js-evaluator';
import { getErrorMessage } from './errors';

let evalPatched = false;
let parserCompatPatched = false;

function extractVideoSummaryParagraphText(paragraph: unknown): string {
  if (!paragraph || typeof paragraph !== 'object') return '';

  const data = paragraph as {
    videoSummaryParagraphView?: { text?: { content?: string } };
    text?: { content?: string };
  };

  return data.videoSummaryParagraphView?.text?.content ?? data.text?.content ?? '';
}

export function patchParserCompatibility(): void {
  if (parserCompatPatched) return;

  if (!Parser.hasParser('VideoSummaryContentView')) {
    class VideoSummaryContentViewCompat extends YTNodes.HorizontalList {
      summary_text: string;

      constructor(data: { paragraphs?: unknown[] }) {
        super({ visibleItemCount: 0, items: [] });

        const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
        this.summary_text = paragraphs
          .map(extractVideoSummaryParagraphText)
          .filter(Boolean)
          .join('\n');
      }
    }

    Parser.addRuntimeParser('VideoSummaryContentView', VideoSummaryContentViewCompat);
  }

  parserCompatPatched = true;
}

export function patchEval(): void {
  if (evalPatched) return;

  try {
    Platform.shim.eval = evaluatePlayerScript;
    evalPatched = true;
    console.log('[YT] Platform.shim.eval patched with WebView evaluator');
  } catch (error) {
    console.warn('[YT] Failed to patch eval:', getErrorMessage(error));
  }
}
