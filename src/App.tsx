import { useEffect, useState, useRef } from 'react'
import * as Comlink from 'comlink';
import './App.css'
import { EventCallbackMap, WorkerExposeApi } from './worker';
import { type SharedWorkerPonyfill as TTT } from '@okikio/sharedworker';

// delete window.SharedWorker;

const { SharedWorkerSupported, SharedWorkerPonyfill } = await import("@okikio/sharedworker");
let myWorker: TTT;
let workerApi: Comlink.Remote<WorkerExposeApi>;

if (SharedWorkerSupported) {
  myWorker = new SharedWorkerPonyfill(new SharedWorker(new URL("./worker.ts", import.meta.url), { name: "position-sync", type: "module" }));
  workerApi = Comlink.wrap<WorkerExposeApi>(myWorker.port);
} else {
  myWorker = new SharedWorkerPonyfill(new Worker(new URL("./worker.ts", import.meta.url), { name: "position-sync", type: "module" }));
  workerApi = Comlink.wrap<WorkerExposeApi>(myWorker);
}

const getEndpointId = (() => {
  let globalEndpointId: string | null = null;
  let subId: string | null = null;
  return () => {
    return new Promise<string>((resolve) => {
      if (globalEndpointId) {
        resolve(globalEndpointId);
      }
      // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
      workerApi.subEvents['onWorkerInitSuccess'](Comlink.proxy((endpointId: string) => {
        globalEndpointId = endpointId;
        resolve(endpointId);
        window.addEventListener('beforeunload', () => {
            workerApi.beforeUnload(endpointId);
        });
        // 一旦触发过一次就取消订阅，防止新开网页时也触发 onWorkerInitSuccess 时把自己的 endpointId 覆盖了
        if (subId) {
          workerApi.off(subId);
        }
      })).then((_subId: string) => {
        subId = _subId;
      });
    })
  }
})()


getEndpointId().then((endpointId) => {
  console.log('endpointId', endpointId);
})

function useSubWorker<T extends keyof EventCallbackMap>(eventName: T, listener: EventCallbackMap[T]) {
  const subIdRef = useRef<string | null>(null);
  const isFirstTimeRender = useRef(true);
  useEffect(() => {
    if (isFirstTimeRender.current) {
      isFirstTimeRender.current = false;
      // @ts-expect-error: 这里需要使用 EventCallbackMap 的 key 来调用 subEvents 方法
      workerApi.subEvents[eventName](Comlink.proxy(listener)).then((subId: string) => {
        subIdRef.current = subId;
      })
    }
  }, [eventName, listener]);

  useEffect(() => {
    return () => {
      if (subIdRef.current) {
        workerApi.off(subIdRef.current);
      }
    }
  }, []);
}


function AppContent() {
  const [count, setCount] = useState(0);
  const isFirstTimeRender = useRef(true);

  useEffect(() => {
    // 初始化获取计数值
    async function initCounter() {
      const value = await workerApi.counter;
      setCount(value);
    }
    if (isFirstTimeRender.current) {
      initCounter();
      isFirstTimeRender.current = false;
    }
  }, []);

  useSubWorker('onCounterChange', (counter: number) => {
    setCount(counter);
  });


  const handleIncrement = async () => {
    const value = await workerApi.inc(123);
    console.log('Incremented value:', value);
  };

  const handleDecrement = () => {
    workerApi.dec();
  };

  useEffect(() => {
    window.addEventListener('beforeunload', () => {
      // workerApi.beforeUnload(window.threadId);
    });
  }, []);


  return (
    <div className="App">
      <h1>Comlink SharedWorker 演示</h1>
      <div className="card">
        <p>当前计数: {count}</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleDecrement}>
            减少
          </button>
          <button onClick={handleIncrement}>
            增加
          </button>
          <button onClick={() => {
            workerApi.getAllEndpointIds().then((endpointIds) => {
              console.log('endpointIds', endpointIds);
            })
          }}>
            获取所有 endpointIds
          </button>
        </div>
        <p>
          <small>
            提示：打开多个标签页，计数值会在所有标签之间同步
          </small>
        </p>
      </div>
    </div>
  );
}

function App() {
  const [show, setShow] = useState(true);  
  return (
    <div className="App">
      <button onClick={() => setShow(!show)}>
        {show ? '隐藏' : '显示'}
      </button>
      {show && <AppContent />}
    </div>
  );
}

export default App;
