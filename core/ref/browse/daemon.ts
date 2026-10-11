import { runBrowseDriver } from './driver.ts';
import type { Binding } from './contract.ts';

// Private IPC entrypoint. It owns live browser state, never a project-write invocation.
if (!process.send) throw new Error('BROWSE_DAEMON_IPC_REQUIRED');
process.once('message', async (binding: Binding) => {
  try {
    const driver = await runBrowseDriver(binding);
    process.send!({ ready: true, endpoint: driver.endpoint, capability: driver.capability, challenge: driver.challenge, pid: process.pid });
    process.disconnect!();
  } catch {
    process.send!({ ready: false, code: 'BROWSE_DRIVER_START_FAILED' });
    process.exitCode = 1; process.disconnect!();
  }
});
