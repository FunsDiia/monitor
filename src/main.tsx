import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 1. Добавляем базовый путь репозитория
    // 2. Убедись, что имя файла совпадает (в коде sw.js, а в корне был service-worker.js)
    navigator.serviceWorker.register('/monitor/sw.js')
      .then(reg => console.log('ВАРТА: Моніторинг активовано'))
      .catch(err => console.error('Ошибка SW:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
