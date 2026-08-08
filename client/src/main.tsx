import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import 'flag-icons/css/flag-icons.min.css';
import './styles/global.css';
import './styles/board.css';
import './styles/pages.css';
import { App } from './App';
import { AppProviders } from './context';
import { PrefsProvider } from './lib/prefs';
import { SoundBridge } from './components/SoundBridge';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <SoundBridge />
        <AppProviders>
          <App />
        </AppProviders>
      </PrefsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
