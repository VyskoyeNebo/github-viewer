import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeNative } from './lib/runtime';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
// No untrusted native errors or sensitive URLs are written to logs.
void initializeNative().catch(() => {
  document.getElementById('root')!.textContent = '原生登录服务无法初始化，请关闭后重新打开应用。';
});
