import { runDownloadRuntimeHeadlessTask } from './download-runtime';

module.exports = async function tonDownloadHeadlessTask(
  taskData?: { action?: 'resume' | 'cancel' | 'retry'; itemId?: number },
): Promise<void> {
  await runDownloadRuntimeHeadlessTask(taskData);
};
