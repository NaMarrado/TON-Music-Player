import { startMainProcess } from './main/bootstrap';
import { registerMediaScheme } from './main/protocol';

registerMediaScheme();
startMainProcess();
