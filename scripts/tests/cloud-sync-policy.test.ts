import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAcknowledgeDesktopCloudOutbox } from '../../packages/desktop/src-main/services/cloud-sync/v2-types.ts';

test('desktop fetch keeps pending local outbox mutations', () => {
  assert.equal(shouldAcknowledgeDesktopCloudOutbox('fetch'), false);
  assert.equal(shouldAcknowledgeDesktopCloudOutbox('upload'), true);
  assert.equal(shouldAcknowledgeDesktopCloudOutbox('sync'), true);
});
