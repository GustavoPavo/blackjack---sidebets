import { useEffect, useState } from 'react';
import { watchOnline } from './native';

/** `true` enquanto houver conexão de rede (o servidor pode ainda estar inacessível: ver `NetworkError`). */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => watchOnline(setOnline), []);
  return online;
}
