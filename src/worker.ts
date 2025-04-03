/// <reference lib="webworker" />
import * as Comlink from 'comlink';
// 声明 SharedWorker 的全局作用域
declare const self: SharedWorkerGlobalScope;

type callbacksMap = {
  eventName: 'counterChange';
  callback: (counter: number) => void;
} | {
  eventName: 'test';
  callback: () => void;
}

export class WorkerExposeApi {
  counter: number;
  private listeners: Map<string, (counter: number) => void>;
  private threadIds = new Set<string>();
  constructor() {
    this.counter = 0;
    this.listeners = new Map();
    self.threadIds = this.threadIds;
  }

  init() {
    const threadId = Math.random().toString(36).substring(2, 15);
    this.threadIds.add(threadId);
    return threadId
  }

  beforeUnload(threadId: string) {
    this.threadIds.delete(threadId);
  }

  inc() {
    this.counter++;
    // 通知所有监听器
    this.notifyListeners();
    return this.counter;
  }

  dec() {
    this.counter--;
    // 通知所有监听器
    this.notifyListeners();
    return this.counter;
  }

  getValue() {
    return this.counter;
  }

  // 添加监听器（客户端需要用 Comlink.proxy() 包装回调函数）
  subscribe(callback: (counter: number) => void) {
    const subId = Math.random().toString(36).substring(2, 15);
    this.listeners.set(subId, callback);
    return subId
  }

  // 取消监听器
  unsubscribe(subId: string) {
    this.listeners.delete(subId);
  }

  // 私有方法，通知所有监听器
  private notifyListeners() {
    for (const listener of this.listeners.values()) {
      // 发送当前计数器值给每个监听器
      listener(this.counter);
    }
  }
}

const exposeApi = new WorkerExposeApi();

function start(port: MessagePort) {
  // port.onmessage = (event) => {
  //   if (event.data === 'beforeunload') {
  //     allPorts.delete(port);
  //   }
  // }
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
