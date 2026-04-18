import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  Avatar, 
  CssBaseline,
  Alert
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

// Mock routing handling (assuming react-router context, or can be passed as a prop)
// Si estás usando react-router-dom, importarías: import { useNavigate } from 'react-router-dom';

const Login = ({ onMockLogin }) => {
  // const navigate = useNavigate(); // Si usamos react-router-dom
  
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    
    // Validación mock muy básica
    if (!usuario || !password) {
      setError('Por favor, ingrese sus credenciales.');
      return;
    }

    // Navegación Mockeada
    console.log('Ingresando con:', usuario);
    if (onMockLogin) {
      onMockLogin();
    } else {
      // simulate navigation
      window.location.hash = '#/dashboard'; 
      // navigate('/dashboard');
    }
  };

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh', 
        backgroundColor: '#f3f3f3' // Fondo gris muy claro
      }}
    >
      <CssBaseline />
      <Paper 
        elevation={3}
        sx={{ 
          p: 5, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          width: '100%',
          maxWidth: 400,
          borderRadius: 2
        }}
      >
        <Avatar 
          sx={{ 
            m: 1, 
            bgcolor: '#1A237E', // Azul corporativo oscuro
            width: 56, 
            height: 56 
          }}
        >
          <VpnKeyIcon fontSize="large" />
        </Avatar>

        <Typography component="h1" variant="h5" sx={{ mb: 3, fontWeight: 'bold', color: '#1A237E' }}>
          Ingresar al Sistema
        </Typography>

        {error && (
          <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleLogin} sx={{ width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="usuario"
            label="Usuario"
            name="usuario"
            autoComplete="username"
            autoFocus
            variant="outlined"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Contraseña"
            type="password"
            id="password"
            autoComplete="current-password"
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{ 
              mt: 3, 
              mb: 2, 
              bgcolor: '#1A237E', 
              '&:hover': {
                bgcolor: '#000666',
              },
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 'bold',
              textTransform: 'none'
            }}
          >
            Ingresar
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
