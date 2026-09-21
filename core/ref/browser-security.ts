import type { BrowserContext } from 'playwright';

export async function disableUnproxiedRealtimeTransports(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport']) {
      Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
    }
  });
}
