export type AcquisitionEngine = 'user-browser' | 'omd-profile' | 'headless' | 'cdp' | 'custom-browser' | 'native-fetch';
export type AcquisitionDocument = Readonly<{ url: string; httpStatus: number | null; httpStatusSource: 'response' | 'unobserved' }>;
export interface AcquisitionPage {
  readonly engine: AcquisitionEngine;
  navigate(url: string): Promise<AcquisitionDocument>;
  resize(width: number, height: number): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  screenshot(fullPage?: boolean): Promise<Readonly<{ buffer: Buffer; width: number; height: number }>>;
  requestHelp(request: { prompt: string; title?: string; completionCriteria?: string; timeoutMs?: number }): Promise<string>;
  close(): Promise<void>;
}
