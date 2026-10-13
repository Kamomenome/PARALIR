/// <reference lib="webworker" />
import { createHandler } from './handler';
import './modes';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createHandler((msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (ev) => handle(ev.data);
