/// <reference lib="webworker" />
import * as Comlink from 'comlink';
// 声明 SharedWorker 的全局作用域
declare const self: SharedWorkerGlobalScope;

// 创建一个 Set 存储端点 ID
const endpointIds = new Set<string>();

// 定义事件名称数组
const allEvents = ['onCounterChange', 'onWorkerInitSuccess'] as const;
type EventName = typeof allEvents[number];

// 定义事件回调映射
export interface EventCallbackMap {
  onCounterChange: (count: number) => void;
  onWorkerInitSuccess: (endpointId: string) => void;
}

// 定义回调方法集合类型
type Callbacks = {
  [K in EventName]: (cb: EventCallbackMap[K]) => string;
};

// 定义监听器类型，使用字符串联合类型作为键
type ListenersType = {
  [K in EventName as `${string}__${K}`]?: EventCallbackMap[K];
};

// 工厂函数
function createWorkerApi() {
  // 创建监听器存储对象
  const listeners: ListenersType = {};

  // 私有方法：添加监听器
  function subscribe<T extends EventName>(eventName: T, cb: EventCallbackMap[T]): string {
    const subId = Math.random().toString(36).substring(2, 15);
    const key = `${subId}__${eventName}` as const;
    // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
    listeners[key] = cb;
    return subId;
  }

  // 私有方法：通知所有监听器
  function notifyListeners<T extends EventName>(eventName: T, data: Parameters<EventCallbackMap[T]>[0]): void {
    for (const listenerKey of Object.keys(listeners)) {
      if (listenerKey.includes(eventName)) {
        // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
        const callback = listeners[listenerKey];
        if (callback) {
          callback(data);
        }
      }
    }
  }

  // 动态创建 subEvents 对象
  const allSubEvents = allEvents.reduce((acc, event) => {
    acc[event] = (cb: EventCallbackMap[typeof event]) => {
      return subscribe(event, cb);
    };
    return acc;
  }, {} as Callbacks);

  // 返回 API 对象
  return {
    counter: 0,
    ...allSubEvents,

    beforeUnload(endpointId: string) {
      endpointIds.delete(endpointId);
    },

    inc(num: number) {
      this.counter += num;
      notifyListeners('onCounterChange', this.counter);
      return this.counter;
    },

    dec() {
      this.counter--;
      notifyListeners('onCounterChange', this.counter);
      return this.counter;
    },

    off(subId: string) {
      for (const listenerKey of Object.keys(listeners)) {
        if (listenerKey.startsWith(subId)) {
          // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
          delete listeners[listenerKey];
        }
      }
    },

    getAllEndpointIds() {
      return Array.from(endpointIds);
    },

    test<T extends EventName>(eventName: T, cb: EventCallbackMap[T]) {
      const subId = Math.random().toString(36).substring(2, 15);
      const key = `${subId}__${eventName}` as const;
      // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
      listeners[key] = cb;
      return subId;
    },

    notifyListeners
  };
}

export type WorkerExposeApi = ReturnType<typeof createWorkerApi>;

// 使用工厂函数创建 API
const workerApi = createWorkerApi();

function start(port: MessagePort) {
  // 每次有新的连接时，生成一个唯一的 endpointId
  const endpointId = Math.random().toString(36).substring(2, 15);
  endpointIds.add(endpointId);
  // 暴露给客户端的 API 是同一个对象，这样才能达到如 counter 这种值的共享
  Comlink.expose(workerApi, port);
  // 延迟 0.5s 再通知客户端初始化成功，避免客户端的监听事件还未生效就通知了
  setTimeout(() => {
    console.log('通知客户端初始化成功', endpointId);
    workerApi.notifyListeners('onWorkerInitSuccess', endpointId);
  }, 500);
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
