import React, {useState} from 'react'
import ChatPage from './ChatPage'
import LoginPage from './LoginPage'

function App()
{
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState("")
  const [token,setToken] = useState("")

  if(isLoggedIn)
  {
    return <ChatPage user = {username} token = {token}/>
  }
  else
  {
    return <LoginPage
    onLogin = {(user,jwt) =>
    {
      setUsername(user)
      setToken(jwt)
      setIsLoggedIn(true)
    }
    
      }
      />
  }
}

export default App;