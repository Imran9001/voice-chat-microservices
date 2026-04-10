import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    CssBaseline, Typography, Paper, Box, Avatar, List, ListItemButton, 
    ListItemAvatar, ListItemText, IconButton, InputBase,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, LinearProgress,
    useMediaQuery, useTheme
} from "@mui/material";
import SendIcon from '@mui/icons-material/Send'; 
import CircleIcon from '@mui/icons-material/Circle';
import MicIcon from '@mui/icons-material/Mic'; 
import CloseIcon from '@mui/icons-material/Close'; 
import PhoneIcon from '@mui/icons-material/Phone';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import CallModal from './CallModal.jsx';

function ChatPage({ user, token }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [userList, setUserList] = useState([]);
  const [receiver, setReceiver] = useState(null);

  // FIX 1: Separate panel visibility from receiver so WebSocket stays alive
  const [showSidebar, setShowSidebar] = useState(true);
  
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null); 

  // Mic Test States
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioRef = useRef(null); 
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false); 

  // VOICE CALL STATES 
  const [activeCallReceiver, setActiveCallReceiver] = useState(null); 
  const [incomingCallFrom, setIncomingCallFrom] = useState(null);     
  const [peerAccepted, setPeerAccepted] = useState(false); 

  //  TAB CLOSE 
  const activeCallRef = useRef(null);

  // FIX 3: Reactive media query instead of window.innerWidth snapshot
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  
  useEffect(() => {
      activeCallRef.current = activeCallReceiver;
  }, [activeCallReceiver]);

  useEffect(() => {
      const handleTabClose = () => {
          if (activeCallRef.current && socketRef.current) {
              socketRef.current.send("__CALL_ENDED__");
          }
      };

      window.addEventListener("beforeunload", handleTabClose);
      return () => window.removeEventListener("beforeunload", handleTabClose);
  }, []);

  
  const ringtoneRef = useRef(new Audio('/ringtone.mp3')); 
  //  Soundboard Player
  const sfxPlayerRef = useRef(new Audio()); 

  // FETCH USERS 
  useEffect(() => {
    fetch(`${import.meta.env.VITE_JAVA_URL}/users`)
      .then((res) => res.json())
      .then((data) => {
        const others = data.filter(u => u !== user);
        setUserList(others);
        // FIX 3: Use reactive isDesktop instead of window.innerWidth snapshot
        if (others.length > 0 && isDesktop) setReceiver(others[0]);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [user, isDesktop]);

  // WEBSOCKET 
  useEffect(() => {
    if (!receiver) return;
    setMessages([]);
    const ws = new WebSocket(`${import.meta.env.VITE_PYTHON_WS_URL}/ws?token=${token}&receiver=${receiver}`);
    
    ws.onopen = () => { socketRef.current = ws; };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data); 

        const isSystemCommand = [
            "__CALL__", "__CALL_ACCEPTED__", "__CALL_ENDED__", "__CALL_DECLINED__",
            "__SFX_1__", "__SFX_2__", "__SFX_3__"
        ].includes(data.content);

        if (isSystemCommand) {
            if (data.sender !== user) {
                if (data.content === "__CALL__") {
                    setIncomingCallFrom(data.sender);
                } 
                else if (data.content === "__CALL_ACCEPTED__") {
                    setPeerAccepted(true);
                } 
                else if (data.content === "__CALL_ENDED__") {
                    setIncomingCallFrom(null);   
                    setActiveCallReceiver(null); 
                    setPeerAccepted(false);      
                } 
                else if (data.content === "__CALL_DECLINED__") {
                    setActiveCallReceiver(null); 
                    setPeerAccepted(false);
                    alert(`${data.sender} declined the call.`); 
                }
                else if (data.content === "__SFX_1__") {
                    sfxPlayerRef.current.src = '/sfx1.mp3';
                    sfxPlayerRef.current.play().catch(e => console.log(e));
                }
                else if (data.content === "__SFX_2__") {
                    sfxPlayerRef.current.src = '/sfx2.mp3';
                    sfxPlayerRef.current.play().catch(e => console.log(e));
                }
                else if (data.content === "__SFX_3__") {
                    sfxPlayerRef.current.src = '/sfx3.mp3';
                    sfxPlayerRef.current.play().catch(e => console.log(e));
                }
            }
            return; 
        }

        const newMessage = {
          id: Date.now(),
          text: data.content,
          isMe: data.sender !== receiver 
        };
        setMessages((prev) => [...prev, newMessage]);
      } catch (error) { 
          console.log("Non-JSON message:", event.data); 
      }
    };

    return () => { ws.close(); };
  }, [receiver, token, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //  Ringtone trigger 
  useEffect(() => {
      ringtoneRef.current.loop = true;

      if (incomingCallFrom) {
          ringtoneRef.current.play().catch(err => console.log("Autoplay blocked by browser:", err));
      } else {
          ringtoneRef.current.pause();
          ringtoneRef.current.currentTime = 0; 
      }
      
      return () => {
          ringtoneRef.current.pause();
          ringtoneRef.current.currentTime = 0; 
      };
  }, [incomingCallFrom]);

  //  SEND TEXT
  const handleSend = () => {
    if (input.trim() !== "" && socketRef.current) {
      socketRef.current.send(input);
      setInput("");
    } 
  };

  // INITIATE CALL
  const handleStartCall = () => {
      setPeerAccepted(false); 
      socketRef.current.send("__CALL__");
      setActiveCallReceiver(receiver);
  };

  const handleEndCall = useCallback(() => {
      if (socketRef.current) {
          socketRef.current.send("__CALL_ENDED__");
      }
      setActiveCallReceiver(null);
      setPeerAccepted(false); 
  }, []); 

  //  MIC TEST 
  const startMicTest = async () => {
    setIsTesting(true);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnectionRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
            if (audioRef.current) audioRef.current.srcObject = event.streams[0];
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') resolve();
            else {
                pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
                setTimeout(resolve, 2000); 
            }
        });

        const response = await fetch(`${import.meta.env.VITE_GO_WEBRTC_URL}/test-mic`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pc.localDescription)
        });

        const answer = await response.json();
        await pc.setRemoteDescription(answer);
    } catch (error) { setIsTesting(false); }
  };

  const stopMicTest = () => {
      setIsTesting(false);
      if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null; }
  };

  // FIX 1: Select contact without nulling receiver — just toggle panel visibility
  const handleSelectContact = (contactName) => {
      setReceiver(contactName);
      setShowSidebar(false);
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{ 
          height: "100dvh",
          bgcolor: "#0f172a", 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center" 
      }}>
        <Paper elevation={10} sx={{ 
            width: { xs: "100%", md: "90%" }, 
            maxWidth: "1100px", 
            height: { xs: "100%", md: "85vh" }, 
            display: "flex", 
            overflow: "hidden", 
            borderRadius: { xs: 0, md: 3 }, 
            border: { xs: "none", md: "1px solid #334155" } 
        }}>
            
            {/* LEFT SIDEBAR — FIX 1: controlled by showSidebar, not receiver */}
            <Box sx={{ 
                width: { xs: "100%", md: "30%" }, 
                display: { xs: showSidebar ? "flex" : "none", md: "flex" },
                borderRight: { xs: "none", md: "1px solid #334155" }, 
                bgcolor: "#1e293b", 
                flexDirection: "column" 
            }}>
                <Box sx={{ p: 2, bgcolor: "#0f172a", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #334155" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Avatar sx={{ bgcolor: "#3b82f6" }}>{user[0]?.toUpperCase()}</Avatar>
                        <Typography variant="subtitle1" fontWeight="bold" color="white">{user}</Typography>
                    </Box>
                    <IconButton onClick={() => setIsMicOpen(true)} sx={{ color: "#94a3b8", "&:hover": { color: "#3b82f6", bgcolor: "#1e293b" } }}>
                        <MicIcon />
                    </IconButton>
                </Box>

                <Box sx={{ p: 2 }}><Typography variant="h6" fontWeight="bold" sx={{ color: "#94a3b8" }}>Messages</Typography></Box>

                <List sx={{ overflowY: "auto", flexGrow: 1 }}>
                    {userList.map((contactName) => (
                        <ListItemButton 
                            key={contactName} selected={receiver === contactName}
                            onClick={() => handleSelectContact(contactName)}
                            sx={{ borderRadius: 2, mx: 1, mb: 0.5, color: "white", "&.Mui-selected": { bgcolor: "#334155" }, "&:hover": { bgcolor: "#334155" } }}
                        >
                            <ListItemAvatar>
                                <Avatar sx={{ bgcolor: receiver === contactName ? "#3b82f6" : "#64748b", color: "white" }}>{contactName[0]?.toUpperCase()}</Avatar>
                            </ListItemAvatar>
                            <ListItemText primary={contactName} />
                            <CircleIcon sx={{ fontSize: 10, color: "#22c55e" }} />
                        </ListItemButton>
                    ))}
                </List>
            </Box>

            {/* RIGHT CHAT AREA — FIX 1: controlled by showSidebar, not receiver */}
            <Box sx={{ 
                width: { xs: "100%", md: "70%" }, 
                display: { xs: showSidebar ? "none" : "flex", md: "flex" }, 
                flexDirection: "column", 
                bgcolor: "#0b1120" 
            }}> 
                
                {/* CHAT HEADER */}
                {receiver ? (
                    <Box sx={{ p: 2, bgcolor: "#1e293b", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 2 } }}>
                            {/* FIX 1: Back button shows sidebar without touching receiver */}
                            <IconButton 
                                onClick={() => setShowSidebar(true)} 
                                sx={{ display: { xs: "flex", md: "none" }, color: "white", mr: 1 }}
                            >
                                <ArrowBackIcon />
                            </IconButton>
                            <Avatar sx={{ width: 40, height: 40, bgcolor: "#3b82f6" }}>{receiver[0]}</Avatar>
                            <Typography variant="h6" color="white">{receiver}</Typography>
                        </Box>
                        
                        <IconButton onClick={handleStartCall} sx={{ color: "#22c55e", bgcolor: "#0f172a", "&:hover": { bgcolor: "#1e293b" } }}>
                            <PhoneIcon />
                        </IconButton>
                    </Box>
                ) : (
                    <Box sx={{ p: 2, bgcolor: "#1e293b", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Typography color="#94a3b8">Select a chat to start messaging</Typography>
                    </Box>
                )}

                {/* MESSAGES FEED */}
                <Box sx={{ flexGrow: 1, p: 3, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {messages.map((msg) => (
                        <Box key={msg.id} sx={{ alignSelf: msg.isMe ? "flex-end" : "flex-start", maxWidth: { xs: "85%", md: "70%" }, minWidth: "100px" }}>
                            <Paper sx={{ p: 1.5, px: 2, bgcolor: msg.isMe ? "#1d4ed8" : "#334155", color: "white", borderRadius: msg.isMe ? "15px 15px 0px 15px" : "15px 15px 15px 0px" }}>
                                <Typography variant="body1">{msg.text}</Typography>
                                <Typography variant="caption" sx={{ display: "block", textAlign: "right", mt: 0.5, color: "#cbd5e1", fontSize: "0.7rem" }}>
                                    {new Date(msg.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Paper>
                        </Box>
                    ))}
                    <div ref={messagesEndRef} />
                </Box>

                {/* INPUT BAR */}
                {receiver && (
                    <Box sx={{ p: 2, bgcolor: "#1e293b", display: "flex", alignItems: "center", gap: 1 }}>
                        <Paper component="form" sx={{ p: "2px 4px", display: "flex", alignItems: "center", flexGrow: 1, borderRadius: 5, bgcolor: "#334155" }}>
                            <InputBase sx={{ ml: 2, flex: 1, color: "white" }} placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if(e.key === "Enter") { e.preventDefault(); handleSend(); }}} />
                        </Paper>
                        <IconButton color="primary" sx={{ bgcolor: "#3b82f6", color: "white", "&:hover":{bgcolor:"#2563eb"} }} onClick={handleSend}>
                            <SendIcon />
                        </IconButton>
                    </Box>
                )}
            </Box>
        </Paper>
      </Box>

      {/* INCOMING CALL DIALOG */}
      <Dialog open={!!incomingCallFrom} PaperProps={{ sx: { bgcolor: "#1e293b", color: "white", borderRadius: 3, minWidth: "300px" }}}>
          <DialogTitle sx={{ textAlign: "center", pt: 3 }}>Incoming Call</DialogTitle>
          <DialogContent sx={{ textAlign: "center" }}>
              <Avatar sx={{ width: 80, height: 80, bgcolor: "#3b82f6", mx: "auto", mb: 2 }}>{incomingCallFrom?.[0]?.toUpperCase()}</Avatar>
              <Typography variant="h6">{incomingCallFrom} is calling...</Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 2 }}>
              <Button variant="contained" color="error" onClick={() => {
                  setIncomingCallFrom(null);
                  if (socketRef.current) {
                      socketRef.current.send("__CALL_DECLINED__");
                  }
              }}>Decline</Button>

              <Button variant="contained" color="success" onClick={() => {
                  setIncomingCallFrom(null); 
                  setPeerAccepted(true); 
                  setActiveCallReceiver(incomingCallFrom);
                  
                  if (socketRef.current) {
                      socketRef.current.send("__CALL_ACCEPTED__");
                  }
              }}>Accept</Button>
          </DialogActions>
      </Dialog>

      {/* VOICE CALL MODAL */}
      <CallModal 
        isOpen={!!activeCallReceiver} 
        onClose={handleEndCall} 
        currentUser={user} 
        receiverUser={activeCallReceiver} 
        peerHasJoined={peerAccepted} 
        sendSignal={(command) => {
            if (socketRef.current) {
                socketRef.current.send(command);
            }
        }}
      />

      {/* MIC TEST MODAL — FIX 2: responsive minWidth */}
      <Dialog open={isMicOpen} onClose={() => { stopMicTest(); setIsMicOpen(false); }} PaperProps={{ sx: { bgcolor: "#1e293b", color: "white", minWidth: { xs: "90vw", sm: "400px" }, borderRadius: 3 }}}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Microphone Test <IconButton onClick={() => { stopMicTest(); setIsMicOpen(false); }} sx={{ color: "#94a3b8" }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
            <audio ref={audioRef} autoPlay />
            <Box sx={{ width: "100%", height: "100px", bgcolor: "#0f172a", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isTesting ? <Typography variant="body2" color="#22c55e">Listening...</Typography> : <Typography variant="body2" color="#64748b">Press Start to test</Typography>}
            </Box>
            {isTesting && <LinearProgress color="success" sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ pb: 3, justifyContent: "center" }}>
            {!isTesting ? <Button variant="contained" onClick={startMicTest}>Start Test</Button> : <Button variant="contained" color="error" onClick={stopMicTest}>Stop Test</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ChatPage;
