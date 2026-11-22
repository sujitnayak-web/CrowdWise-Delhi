import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1 Google Maps Platform auth & quota exhaustion listener
let lastAuthErrorKind: 'invalid-key' | 'quota' | null = null;

(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  if (lastAuthErrorKind === 'invalid-key') {
    window.dispatchEvent(new CustomEvent('gmp-invalid-key'));
    return;
  }
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (
    msg.includes('InvalidKeyMapError') ||
    msg.includes('RefererNotAllowedMapError') ||
    msg.includes('ApiNotActivatedMapError') ||
    msg.includes('ApiProjectMapError')
  ) {
    lastAuthErrorKind = 'invalid-key';
    window.dispatchEvent(new CustomEvent('gmp-invalid-key'));
  } else if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    lastAuthErrorKind = 'quota';
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);
