import { useEffect, useState, useRef } from 'react'
import * as Comlink from 'comlink';
import './App.css'
import { EventCallbackMap, WorkerExposeApi } from './worker';
import { type SharedWorkerPonyfill as SharedWorkerPonyfillType } from '@okikio/sharedworker';
import debug from 'debug';
import { nanoid } from 'nanoid';

const appLog = debug('app').extend('render');
const workerLog = debug('app').extend('worker');

// 执行下面一行，模拟 SharedWorker 不支持的环境。在 SharedWorker 不支持情况下，可以看到网页之间不共享了，这也是预期行为
// 以我这次想要把 mqtt client 服务放在 SharedWorker 中为例子，如果 SharedWorker 不支持，那么 mqtt client 服务在
// 每一个网页中都生成一个，他们之间 clientId 不同，因此如果有消息时会每一个都触发，也能达到消息在每一个网页的共享
// 如果 SharedWorker 支持，那么 mqtt client 服务在 SharedWorker 中只生成一个，也能保障各自共享一份 workerExposeApi 实例而同步
// delete window.SharedWorker;


// 这样异步 import 是为了保障 SharedWorkerSupported 的判断在 delete window.SharedWorker; 之后，如果是顶部 import 的话，SharedWorkerSupported 的判断就会在 delete 执行前已经得出了结果了
const { SharedWorkerSupported, SharedWorkerPonyfill } = await import("@okikio/sharedworker");
let myWorker: SharedWorkerPonyfillType;
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
	return () => {
		if (globalEndpointId) {
			return globalEndpointId;
		}
		globalEndpointId = `endpointId__${nanoid(8)}`;
    workerLog('addEndpointId', globalEndpointId);
		workerApi.addEndpointId(globalEndpointId);
		window.addEventListener('beforeunload', () => {
			if (globalEndpointId) {
				workerApi.beforeUnload(globalEndpointId);
			}
		});
		return globalEndpointId;
	};
})()

function useGetAllEndpointIds() {
  const [endpointIds, setEndpointIds] = useState<string[]>([]);
  useEffect(() => {
    workerApi.getAllEndpointIds().then((endpointIds) => {
      setEndpointIds(endpointIds);
    })
  }, []); 

  useSubWorkerEvent('endpointIdsChange', (endpointIds: string[]) => {
    setEndpointIds(endpointIds);
  });

  return endpointIds;
}

function useSubWorkerEvent<T extends keyof EventCallbackMap>(eventName: T, listener: EventCallbackMap[T]) {
  const listenerIdRef = useRef<string | null>(null);
  const isFirstTimeRender = useRef(true);
  useEffect(() => {
    if (isFirstTimeRender.current) {
      isFirstTimeRender.current = false;
      workerApi.addListener(eventName, Comlink.proxy(listener)).then((listenerId: string) => {
        listenerIdRef.current = listenerId;
      })
    }
  }, [eventName, listener]);

  useEffect(() => {
    return () => {
      if (listenerIdRef.current) {
        workerApi.off(listenerIdRef.current);
      }
    }
  }, []);
}


function AppContent() {
  const [count, setCount] = useState(0);
  const isFirstTimeRender = useRef(true);
  const endpointId = getEndpointId();
  const endpointIds = useGetAllEndpointIds();
  
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

  useSubWorkerEvent('counterChange', (counter: number) => {
    setCount(counter);
  });


  const handleIncrement = async () => {
    const value = await workerApi.inc(123);
    appLog('Incremented value:', value);
  };

  const handleDecrement = () => {
    workerApi.dec();
  };


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
        </div>
        <p>
          <small>
            当前页面 endpointId: {endpointId}
          </small>
        </p>
        <p>
          <small>
            所有页面 endpointIds: {endpointIds.join(', ')}
          </small>
        </p>
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
