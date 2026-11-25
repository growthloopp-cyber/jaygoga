import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  try {
    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    const proto = Object.getPrototypeOf(window);
    const protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'fetch') : undefined;
    const hasGetterOnly =
      (ownDesc && ownDesc.get && !ownDesc.set) ||
      (!ownDesc && protoDesc && protoDesc.get && !protoDesc.set);
    if (hasGetterOnly && (!ownDesc || ownDesc.configurable)) {
      Object.defineProperty(window, 'fetch', {
        value: window.fetch,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  } catch {
    // Ignore non-configurable host descriptors
  }
}

createRoot(document.getElementById('root')!).render(<App />);
