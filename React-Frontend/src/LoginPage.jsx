import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Link,
  CssBaseline,
  Alert,
  Avatar
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import LoginIcon from '@mui/icons-material/Login';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    // Clear any previous errors when trying to log in again
    setError(""); 

    try {
      const response = await fetch(`${import.meta.env.VITE_JAVA_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token && data.token !== "fail") {
          onLogin(username, data.token);
        } else {
          setError("Login Failed. Incorrect Username or Password");
        }
      } else {
        setError("Login Failed. Incorrect Username or Password");
      }
    } catch (err) {
      setError("Could not connect to Java Server");
    }
  };

  return (
    <>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #3b82f6 100%)',
        }}
      >
        <Container maxWidth="xs">
          <Paper
            elevation={10}
            sx={{
              p: 4,
              borderRadius: 4,
              backdropFilter: 'blur(10px)', 
            }}
          >
            <Stack spacing={3}>
              
              {/* Branding Header */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Avatar sx={{ m: 1, bgcolor: 'primary.main', width: 56, height: 56, mb: 2 }}>
                  <MicIcon fontSize="large" />
                </Avatar>
                <Typography variant="h4" fontWeight="bold" color="text.primary">
                  VoiceChat
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Sign in to continue
                </Typography>
              </Box>

              {/* Error Alert Display */}
              {error && (
                <Alert severity="error" onClose={() => setError("")}>
                  {error}
                </Alert>
              )}

              <TextField
                label="Username"
                variant="outlined"
                fullWidth
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <TextField
                label="Password"
                type="password"
                variant="outlined"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleSignIn}
                startIcon={<LoginIcon />}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderRadius: 2
                }}
              >
                Sign in
              </Button>

              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Don't have an account?{' '}
                  <Link href="#" underline="hover" fontWeight="bold">
                    Sign Up
                  </Link>
                </Typography>
              </Box>

            </Stack>
          </Paper>
        </Container>
      </Box>
    </>
  );
}

export default LoginPage;
