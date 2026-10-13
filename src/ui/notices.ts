import { DecodeError } from '../app/decode';
import { h } from './layout';

export function setNotices(target: HTMLElement, messages: string[]): void {
  target.replaceChildren(...messages.map((m) => h('p', {}, m)));
}

/** User-facing reason for a failed load (R01). */
export function loadErrorMessage(e: unknown): string {
  if (e instanceof DecodeError) return e.message;
  return `読み込めません: ${e instanceof Error ? e.message : String(e)}`;
}

export const TRANSPARENCY_NOTICE = '透明な部分は白で合成しました（seed と変換は白合成後の画素から作ります）';
