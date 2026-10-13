import { describe, expect, it, vi } from 'vitest';
import { blockExternalRequests } from '../../src/app/offline';

function fakeWindow(href: string) {
  const fetch = vi.fn(async () => new Response('ok'));
  const opened: string[] = [];
  class XHR {
    open(_m: string, url: string) {
      opened.push(url);
    }
  }
  const beacon = vi.fn(() => true);
  const win = { fetch, XMLHttpRequest: XHR, navigator: { sendBeacon: beacon }, location: new URL(href) } as any;
  return { win, fetch, opened, beacon };
}

describe('no request leaves the device (004 FR-409)', () => {
  it('same-origin, data: and blob: pass; other origins are stopped before the network', async () => {
    const { win, fetch, opened, beacon } = fakeWindow('http://localhost:5173/');
    blockExternalRequests(win);
    await win.fetch('/models/a.tflite');
    await win.fetch('data:text/plain,hi');
    await win.fetch('blob:http://localhost:5173/abc');
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(win.fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST' })).rejects.toThrow('外部への通信');
    await expect(win.fetch(new Request('https://example.com/x'))).rejects.toThrow('外部への通信');
    expect(fetch).toHaveBeenCalledTimes(3);
    const x = new win.XMLHttpRequest();
    x.open('GET', '/local');
    expect(() => x.open('POST', 'https://example.com/')).toThrow('外部への通信');
    expect(opened).toEqual(['/local']);
    expect(win.navigator.sendBeacon('https://example.com/b', 'x')).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('on file:// every http(s) request is stopped', async () => {
    const { win, fetch } = fakeWindow('file:///C:/app/index.html');
    blockExternalRequests(win);
    await expect(win.fetch('http://localhost/x')).rejects.toThrow('外部への通信');
    await win.fetch('data:,x');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
