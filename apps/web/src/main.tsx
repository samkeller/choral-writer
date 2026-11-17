import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';

import '@mantine/core/styles.css';
import './styles.css';
import { App } from './App.js';
import { cssVariablesResolver, theme } from './theme/theme.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider forceColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
);
