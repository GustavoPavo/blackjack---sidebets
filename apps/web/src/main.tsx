import { createRoot } from 'react-dom/client';
import { App } from './App';
import { nativeInit } from './native';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
void nativeInit(); // app nativo: barra de status e fim da tela de abertura
