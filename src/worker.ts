/// <reference lib="webworker" />
import * as Comlink from 'comlink';
// 声明 SharedWorker 的全局作用域
declare const self: SharedWorkerGlobalScope;

const endpointIds = new Set<string>();

const allEvents = ['onCounterChange', 'onWorkerInitSuccess'] as const;

export type EventCallbackMap = {
  onCounterChange: (counter: number) => void;
  onWorkerInitSuccess: (endpointId: string) => void;
}

type ListenersType = {
  [K in typeof allEvents[number] as `${string}__${K}`]?: EventCallbackMap[K];
}

export type Callbacks = {
  [K in typeof allEvents[number]]: (cb: EventCallbackMap[K]) => string;
}

export class WorkerExposeApi {
  counter: number;
  private listeners: ListenersType = {};
  // 暴露给客户端的 API 去订阅事件，为什么要这么麻烦转换一次呢，因为 comlink 只允许一次暴露一个 callback 函数，所以以定义好 allEvents 类型，然后批量生成对外的订阅函数
  subEvents: Callbacks = allEvents.reduce((acc, event) => {
    acc[event] = (cb: EventCallbackMap[typeof event]) => {
      return this.subscribe(event, cb);
    };
    return acc;
  }, {} as Callbacks);

  constructor() {
    this.counter = 0;
  }

  beforeUnload(endpointId: string) {
    endpointIds.delete(endpointId);
  }

  inc(num: number) {
    this.counter += num;
    // 通知所有监听器
    this.notifyListeners('onCounterChange', this.counter);
    return this.counter;
  }

  dec() {
    this.counter--;
    // 通知所有监听器
    this.notifyListeners('onCounterChange', this.counter);
    // this.notifyListeners('onWorkerInitSuccess', endpointIds);
    return this.counter;
  }

  getValue() {
    return this.counter;
  }

  // 添加监听器（客户端需要用 Comlink.proxy() 包装回调函数）
  private subscribe<T extends typeof allEvents[number]>(eventName: T, cb: EventCallbackMap[T]) {
    const subId = Math.random().toString(36).substring(2, 15);
    // @ts-expect-error: sssssssssssss
    this.listeners[`${subId}__${eventName}`] = cb;
    return subId  
  }   

  // 取消监听器
  off(subId: string) {
    for (const listenerKey of Object.keys(this.listeners)) {
      if (listenerKey.startsWith(subId)) {
        delete this.listeners[listenerKey as keyof ListenersType];
      }
    }
  }

  getAllEndpointIds() {
    return Array.from(endpointIds);
  }

  // 私有方法，通知所有监听器
  private notifyListeners<T extends typeof allEvents[number]>(eventName: T, data: Parameters<EventCallbackMap[T]>[0]) {
    for (const listenerKey of Object.keys(this.listeners)) {
      if (listenerKey.includes(eventName)) {
        // @ts-expect-error: sssssssssssss
        this.listeners[listenerKey](data);
      }
    }
  }
}

const exposeApi = new WorkerExposeApi();


function start(port: MessagePort) {
  // 每次有新的连接时，生成一个唯一的 endpointId
  const endpointId = Math.random().toString(36).substring(2, 15);
  endpointIds.add(endpointId);
  // 暴露给客户端的 API 是同一个对象，这样才能达到如 counter 这种值的共享
  Comlink.expose(exposeApi, port);
  // 延迟 1s 再通知客户端初始化成功，避免客户端的监听事件还未生效就通知了
  setTimeout(() => {
    console.log('通知客户端初始化成功', endpointId);
    // @ts-expect-error: 这里调用了 private 方法，但是预期不想暴露给客户端，所以不去掉 private
    exposeApi.notifyListeners('onWorkerInitSuccess', endpointId);
  }, 1000);
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
