import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Avatar,
  IconButton,
  Box,
  Tooltip,
  Tabs,
  Tab,
  Button,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TransferUploadDialog from '../components/TransferUploadDialog';

const NAV = [
  { label: 'Transferencias', path: '/dashboard' },
  { label: 'Destinos', path: '/destinos' },
];

const MainLayout = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);

  const currentTab =
    location.pathname.startsWith('/destinos') ? '/destinos'
    : '/dashboard';

  const handleLogout = () => {
    if (onLogout) onLogout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#f3f3f3' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: '#1A237E',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Typography
            variant="h6"
            sx={{
              fontFamily: '"Manrope", sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#ffffff',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() => navigate('/dashboard')}
          >
            Sistema de Validación de Pagos
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <Tooltip title="Cargar comprobante y validar con OCR">
              <Button
                variant="contained"
                size="small"
                startIcon={<CloudUploadIcon />}
                onClick={() => setUploadOpen(true)}
                sx={{
                  color: '#1A237E',
                  bgcolor: '#fff',
                  fontWeight: 700,
                  textTransform: 'none',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' },
                }}
              >
                Cargar transferencia
              </Button>
            </Tooltip>
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: 'rgba(255,255,255,0.15)',
                cursor: 'default',
              }}
            >
              <AccountCircleIcon fontSize="small" />
            </Avatar>
            <Tooltip title="Cerrar Sesión">
              <IconButton
                size="small"
                onClick={handleLogout}
                sx={{ color: 'rgba(255,255,255,0.85)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>

        <Box sx={{ bgcolor: '#fff', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={currentTab}
            onChange={(_, v) => navigate(v)}
            sx={{
              minHeight: 44,
              px: 1,
              '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600, color: '#454652' },
              '& .Mui-selected': { color: '#1A237E' },
              '& .MuiTabs-indicator': { bgcolor: '#1A237E' },
            }}
          >
            {NAV.map((n) => (
              <Tab key={n.path} label={n.label} value={n.path} />
            ))}
          </Tabs>
        </Box>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Outlet />
      </Box>

      <TransferUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </Box>
  );
};

export default MainLayout;
