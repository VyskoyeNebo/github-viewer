import { CapacitorHttp } from '@capacitor/core';
import { SafeError } from './errors';

export interface JsonResponse { status: number; data: unknown; headers: Record<string, string> }
export interface RequestOptions { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; data?: string }
export type Transport = (options: RequestOptions) => Promise<JsonResponse>;

// Native HTTP avoids GitHub's browser CORS restrictions. Never log request/response bodies.
export const nativeTransport: Transport = async (options) => {
  try {
    return await CapacitorHttp.request({ ...options, responseType: 'json', connectTimeout: 15000, readTimeout: 20000, disableRedirects: true });
  } catch {
    throw new SafeError('无法连接 GitHub，请检查网络后重试。');
  }
};
