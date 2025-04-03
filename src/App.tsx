import { useEffect, useState, useRef } from 'react'
import * as Comlink from 'comlink';
import './App.css'
import { WorkerExposeApi } from './worker';

// delete window.SharedWorker;

const { SharedWorkerPonyfill, SharedWorkerSupported } = await import("@okikio/sharedworker");
let myWorker: Comlink.Remote<WorkerExposeApi>;

if (SharedWorkerSupported) {
  myWorker = Comlink.wrap<WorkerExposeApi>(new SharedWorkerPonyfill(new SharedWorker(new URL("./worker.ts", import.meta.url), { name: "position-sync", type: "module" })).port);
} else {
  myWorker = Comlink.wrap<WorkerExposeApi>(new SharedWorkerPonyfill(new Worker(new URL("./worker.ts", import.meta.url), { name: "position-sync", type: "module" })).port);
}
// const myWorker = Comlink.wrap<WorkerExposeApi>(new SharedWorker(new URL("./worker.ts", import.meta.url), { name: "position-sync", type: "module" }).port);


function AppContent() {
  const [count, setCount] = useState(0);
  const isFirstTimeRender = useRef(true);
  const subIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 初始化获取计数值
    async function initCounter() {
      const value = await myWorker.counter;
      setCount(value);
    }
    initCounter();
  }, []);

  useEffect(() => {
      if (isFirstTimeRender.current) {
        isFirstTimeRender.current = false;
        myWorker.subscribe(Comlink.proxy((newValue: number) => {
          setCount(newValue);
        })).then((subId: string) => {
          subIdRef.current = subId;
        })
      }
  }, []);

  useEffect(() => {
    return () => {
      if (subIdRef.current) {
        myWorker.unsubscribe(subIdRef.current);
      }
    }
  }, []); 

  const handleIncrement = async () => {
    const value = await myWorker?.inc();
    console.log('Incremented value:', value);
  };

  const handleDecrement = () => {
    myWorker?.dec();
  };

  useEffect(() => {
    window.addEventListener('beforeunload', () => {
      myWorker[Comlink.releaseProxy]()
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
