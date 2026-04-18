import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

// Layouts y Páginas (paths relativos desde src/ hacia la raíz del proyecto)
import MainLayout from '../layouts/MainLayout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Detail from '../pages/Detail';
import Destinos from '../pages/Destinos';

// ─── Tema MUI Corporativo ─────────────────────────────────────────────────────
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1A237E',
      dark: '#000666',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#2b5bb5',
    },
    background: {
      default: '#f3f3f3',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a1c1c',
      secondary: '#454652',
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    h1: { fontFamily: '"Manrope", sans-serif', fontWeight: 800 },
    h2: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
    h3: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
    h4: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
    h5: { fontFamily: '"Manrope", sans-serif', fontWeight: 600 },
    h6: { fontFamily: '"Manrope", sans-serif', fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});

// ─── Guard de autenticación simple (mock) ────────────────────────────────────
const ProtectedRoute = ({ isAuth, children }) => {
  return isAuth ? children : <Navigate to="/login" replace />;
};

// ─── App Principal ────────────────────────────────────────────────────────────
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => setIsAuthenticated(false);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          {/* Ruta pública — Login */}
          <Route
            path="/login"
            element={
              isAuthenticated
                ? <Navigate to="/dashboard" replace />
                : <Login onMockLogin={handleLogin} />
            }
          />

          {/* Rutas protegidas — dentro del MainLayout */}
          <Route
            path="/"
            element={
              <ProtectedRoute isAuth={isAuthenticated}>
                <MainLayout onLogout={handleLogout} />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="destinos" element={<Destinos />} />
            <Route path="detail/:id" element={<Detail />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
