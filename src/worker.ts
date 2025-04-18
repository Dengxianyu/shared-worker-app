/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { nanoid } from 'nanoid';
// 声明 SharedWorker 的全局作用域
declare const self: SharedWorkerGlobalScope;


export type EventCallbackMap = {
  counterChange: (counter: number) => void;
  endpointIdsChange: (endpointIds: string[]) => void;
}

type ListenersType = {
  [K in keyof EventCallbackMap as `${string}__${K}`]?: EventCallbackMap[K];
}

export type Callbacks = {
  [K in keyof EventCallbackMap]: (cb: EventCallbackMap[K]) => string;
}

export class WorkerExposeApi {
  private listeners: ListenersType = {};
  counter: number;
	/** 记录所有连接的 endpointId */
	endpointIds = new Set<string>();

  constructor() {
    this.counter = 0;
  }

  inc(num: number) {
    this.counter += num;
    // 通知所有监听器
    this.emit('counterChange', this.counter);
    return this.counter;
  }

  dec() {
    this.counter--;
    // 通知所有监听器
    this.emit('counterChange', this.counter);
    return this.counter;
  }

  // 添加监听器（客户端需要用 Comlink.proxy() 包装回调函数）
  addListener<T extends keyof EventCallbackMap>(eventName: T, cb: EventCallbackMap[T]) {
    const listenerId = `listenerId__${nanoid(8)}`;
    // @ts-expect-error: 无法避免的类型错误
    this.listeners[`${listenerId}__${eventName}`] = cb;
    return listenerId;
  }   

  // 私有方法，通知所有匹配到 eventName 的 callback 执行
  private emit<T extends keyof EventCallbackMap>(eventName: T, data: Parameters<EventCallbackMap[T]>[0]) {
    for (const listenerKey of Object.keys(this.listeners)) {
      if (listenerKey.includes(eventName)) {
        // @ts-expect-error: 无法避免的类型错误
        this.listeners[listenerKey](data);
      }
    }
  }

  // 取消监听器
  off(listenerId: string) {
    for (const listenerKey of Object.keys(this.listeners)) {
      if (listenerKey.startsWith(listenerId)) {
        delete this.listeners[listenerKey as keyof ListenersType];
      }
    }
  }

  addEndpointId(endpointId: string) {
		this.endpointIds.add(endpointId);
    this.emit('endpointIdsChange', Array.from(this.endpointIds));
	}

  getAllEndpointIds() {
    return Array.from(this.endpointIds);
  }


  beforeUnload(endpointId: string) {
    this.endpointIds.delete(endpointId);
    this.emit('endpointIdsChange', Array.from(this.endpointIds));
  }
}

const exposeApi = new WorkerExposeApi();

function start(port: MessagePort) {
	// 暴露给客户端的 API 是同一个对象，这样才能达到如 counter 这种值的共享
	Comlink.expose(exposeApi, port);
}

// 当有新连接时触发
self.onconnect = function(event: MessageEvent) {
  const port = event.ports[0];
  if (port) {
    start(port);
  }
};
// 为不支持 SharedWorker 的环境提供回退
if (!('SharedWorkerGlobalScope' in self)) {
  start(self as unknown as MessagePort);
}
