import type { Page } from 'playwright';

export type ObservedDocument = Readonly<{ identity: string; httpStatus: number }>;
export type DocumentObserver = Readonly<{
  current(): Promise<ObservedDocument>;
  close(): Promise<void>;
}>;
type DocumentResponse = Readonly<{
  type: string; frameId?: string; loaderId: string;
  response: Readonly<{ status: number }>;
}>;
export class DocumentObservationError extends Error {
  override readonly name = 'DocumentObservationError';
  constructor() { super('The current main document has no observed HTTP response binding.'); }
}

export async function observeDocumentResponses(page: Page): Promise<DocumentObserver> {
  const session = await page.context().newCDPSession(page);
  const detach = async (): Promise<void> => {
    if (page.isClosed()) return;
    try { await session.detach(); }
    catch (error) {
      if (page.isClosed()) return;
      throw error;
    }
  };
  try {
    const initial = await session.send('Page.getFrameTree');
    const mainFrameId = initial.frameTree.frame.id;
    const responses = new Map<string, number>();
    const responseReceived = (event: DocumentResponse): void => {
      if (event.type === 'Document' && event.frameId === mainFrameId) responses.set(event.loaderId, event.response.status);
    };
    session.on('Network.responseReceived', responseReceived);
    await session.send('Network.enable');
    return {
      async current() {
        const { frameTree } = await session.send('Page.getFrameTree');
        const frame = frameTree.frame;
        const status = responses.get(frame.loaderId);
        if (frame.id !== mainFrameId || status === undefined) throw new DocumentObservationError();
        return { identity: frame.loaderId, httpStatus: status };
      },
      async close() {
        session.off('Network.responseReceived', responseReceived);
        await detach();
      },
    };
  } catch (error) {
    await detach();
    throw error;
  }
}
