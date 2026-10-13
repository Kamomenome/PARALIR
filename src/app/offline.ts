/**
 * No request leaves the device (constitution: data stays local; 004 FR-409). Some libraries send usage logs on
 * their own (MediaPipe's Tasks post to odml.pa.googleapis.com every minute, with no option to turn it off), so
 * every http(s) request to another origin is stopped here before it reaches the network. Same-origin requests
 * (the dev server), data: and blob: URLs pass. On file:// no http(s) request is same-origin.
 */
export function blockExternalRequests(win: Window & typeof globalThis = window): void {
  const here = win.location;
  const blocked = (url: string) => {
    let u: URL;
    try {
      u = new URL(url, here.href);
    } catch {
      return false;
    }
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== here.origin;
  };
  const stop = (url: string) => new TypeError(`外部への通信は止めています（${new URL(url, here.href).origin}）`);

  const fetch = win.fetch.bind(win);
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return blocked(url) ? Promise.reject(stop(url)) : fetch(input, init);
  }) as typeof win.fetch;

  const open = win.XMLHttpRequest.prototype.open;
  win.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const s = String(url);
    if (blocked(s)) throw stop(s);
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof open;

  const beacon = win.navigator.sendBeacon?.bind(win.navigator);
  if (beacon) win.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => (blocked(String(url)) ? false : beacon(url, data));
}
