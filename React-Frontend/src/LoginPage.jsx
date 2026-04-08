import React from 'react';
import { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Link,
  CssBaseline
} from '@mui/material';



function LoginPage({onLogin}) {

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSignIn = async () =>
  {
    try
    {
      const response = await fetch (`${import.meta.env.VITE_JAVA_URL}/login`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username:username,password:password})
      })

        if (response.ok)
    {
      const data = await response.json();
      if (data.token && data.token!== "fail")
      {
        onLogin(username, data.token);
      }
         
      else
      {
        setError("Login Failed. Incorrect Username or Password");
      }
          
      }
    
    }
    catch(err)
    {
      setError("Could not connect to Java Server")

    }


    
  }

  return (
    <>
      <CssBaseline />
      <Box
        sx={{
          display:'flex',
          justifyContent: 'center',
          alignItems:'center',
          height:'100vh'
        }}
      >
        <Container maxWidth = "xs">

          <Paper
            elevation = {6}
            sx = {{
              p: 4,
              borderRadius:3 
            }}
            >
              <Stack spacing = {3} >
                <Box sx = {{textAlign:'center'}}>
                  <Typography variant = 'h4' fontWeight= 'bold' color = 'primary'>
                    Welcome
                  </Typography>
                  <Typography variant = 'body2' color = 'text.secondary' sx = {{mt:1}}>
                    Sign in to continue
                  </Typography>
                </Box>

                <TextField
                  label = "UserName"
                  variant = "outlined"
                  fullWidth
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  >
                </TextField>

                <TextField
                  label = "Password"
                  type = "password"
                  variant = "outlined"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  >
                </TextField>

                <Button
                  variant = "contained"
                  size = "large"
                  fullWidth
                  onClick = {handleSignIn}
                  sx={{
                    py:1.5,
                    fontSize:'1rem'
                  }}
                  >
                  Sign in 
                </Button>

                <Stack direction = "row">
                <Link href = '#' underline = "hover">Sign Up</Link>

              </Stack>

              </Stack>

              
  
          </Paper>


        </Container>
        
      </Box>

    </>

  );

}


export default LoginPage;
