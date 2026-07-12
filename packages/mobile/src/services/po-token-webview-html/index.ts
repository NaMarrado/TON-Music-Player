import { BOTGUARD_SCRIPT } from './botguard-script';
import { CHALLENGE_SCRIPT } from './challenge-script';
import { HTML_END, HTML_START } from './document';
import { EVALUATOR_SCRIPT } from './evaluator-script';
import { SHARED_SCRIPT } from './shared-script';
import { TOKEN_SCRIPT } from './token-script';

/**
 * HTML page for the hidden WebView that generates po_tokens.
 *
 * Contains the complete BotGuard flow inline:
 * 1. Fetch challenge from Google's WAA API
 * 2. Load & execute BotGuard interpreter JS via new Function()
 * 3. Initialize BotGuard program with a real DOM userInteractionElement
 * 4. Snapshot to get botguardResponse + minter factory
 * 5. Fetch integrity token from GenerateIT endpoint
 * 6. Mint po_token (or use websafeFallbackToken)
 * 7. PostMessage result back to React Native
 */
export const PO_TOKEN_HTML = [
  HTML_START,
  SHARED_SCRIPT,
  CHALLENGE_SCRIPT,
  BOTGUARD_SCRIPT,
  TOKEN_SCRIPT,
  EVALUATOR_SCRIPT,
  HTML_END,
].join('\n');
