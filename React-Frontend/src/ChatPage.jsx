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
  
  // Mobile UI state
  const [showSidebar, setShowSidebar] = useState(true);
  
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null); 

  // Mic Test States
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioRef = useRef(null); 
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false); 

  // Voice Call States - The "Ghost Timer" Fix starts here
  const [activeCallReceiver, setActiveCallReceiver] = useState(null); 
  const [incomingCallFrom, setIncomingCallFrom] = useState(null);     
  const [peerAccepted, setPeerAccepted] = useState(false); 

  // Audio Assets
  const ringtoneRef = useRef(new Audio('/ringtone.mp3')); 
  const dialToneRef = useRef(new Audio('/dialtone.mp3')); 
  const sfxPlayerRef = useRef(new Audio()); 

  // Tab Close Safety
  const activeCallRef = useRef(null);
  useEffect(() => { activeCallRef.current = activeCallReceiver; }, [activeCallReceiver]);

  useEffect(() => {
      const handleTabClose = () => {
          if (activeCallRef.current && socketRef.current) {
              socketRef.current.send("__CALL_ENDED__");
          }
      };
      window.addEventListener("beforeunload", handleTabClose);
      return () => window.removeEventListener("beforeunload", handleTabClose);
  }, []);

  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Fetch users from Java Auth
  useEffect(() => {
    fetch(`${import.meta.env.VITE_JAVA_URL}/users`)
      .then((res) => res.json())
      .then((data) => {
        const others = data.filter(u => u !== user);
        setUserList(others);
        if (others.length > 0 && isDesktop) setReceiver(others[0]);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [user, isDesktop]);

  // WebSocket Central Logic
  useEffect(() => {
    if (!receiver) return;
    setMessages([]);
    
    const ws = new WebSocket(`${import.meta.env.VITE_PYTHON_WS_URL}/ws?token=${token}&receiver=${receiver}`);
    
    // 1. ADD HEARTBEAT INTERVAL VARIABLE
    let heartbeatInterval;

    ws.onopen = () => { 
        socketRef.current = ws; 
        
        // 2. START THE HEARTBEAT (Send a ping every 30 seconds)
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send("__PING__");
            }
        }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data); 
        
        // 3. FILTER: Is this a system command? (Added __PING__ to be ignored)
        const isSystem = typeof data.content === 'string' && (
            data.content.startsWith("__SFX_") || 
            ["__CALL__", "__CALL_ACCEPTED__", "__CALL_ENDED__", "__CALL_DECLINED__", "__PING__"].includes(data.content)
        );

        // 4. LOGIC: Trigger actions if the message is from someone else
        if (data.sender !== user) {
            if (data.content.startsWith("__SFX_")) {
                const sfxNum = data.content.split("_")[3]; 
                sfxPlayerRef.current.src = `/sfx${sfxNum}.mp3`;
                sfxPlayerRef.current.play().catch(e => console.log("SFX Play Error:", e));
            }
            else if (data.content === "__CALL__") {
                setIncomingCallFrom(data.sender);
            }
            else if (data.content === "__CALL_ACCEPTED__") {
                setPeerAccepted(true);
            }
            else if (data.content === "__CALL_ENDED__") {
                // RESET ALL CALL STATES ON DISCONNECT
                setIncomingCallFrom(null); 
                setActiveCallReceiver(null); 
                setPeerAccepted(false);      
            } 
            else if (data.content === "__CALL_DECLINED__") {
                setActiveCallReceiver(null); 
                setPeerAccepted(false);
                alert(`${data.sender} declined the call.`); 
            }
        }

        if (isSystem) return; // __PING__ commands stop here

        const newMessage = { id: Date.now(), text: data.content, isMe: data.sender !== receiver };
        setMessages((prev) => [...prev, newMessage]);
        
      } catch (error) { console.log("WS Data Error:", event.data); }
    };

    return () => { 
        // 5. CLEANUP HEARTBEAT
        clearInterval(heartbeatInterval);
        ws.close(); 
    };
  }, [receiver, token, user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Ringtone / Dialtone Management
  useEffect(() => {
      ringtoneRef.current.loop = true;
      if (incomingCallFrom) {
          ringtoneRef.current.play().catch(e => console.log("Audio play blocked", e));
      } else {
          ringtoneRef.current.pause();
          ringtoneRef.current.currentTime = 0;
      }
  }, [incomingCallFrom]);

  useEffect(() => {
      dialToneRef.current.loop = true;
      if (activeCallReceiver && !peerAccepted) {
          dialToneRef.current.play().catch(e => console.log("Audio play blocked", e));
      } else {
          dialToneRef.current.pause();
          dialToneRef.current.currentTime = 0;
      }
  }, [activeCallReceiver, peerAccepted]);

  const handleSend = () => {
    if (input.trim() !== "" && socketRef.current) { 
        socketRef.current.send(input); 
        setInput(""); 
    } 
  };

  const handleStartCall = () => {
      setPeerAccepted(false); 
      socketRef.current.send("__CALL__");
      setActiveCallReceiver(receiver);
  };

  // THE "GHOST TIMER" FIX: Clear all state here
  const handleEndCall = useCallback(() => {
      if (socketRef.current) socketRef.current.send("__CALL_ENDED__");
      setActiveCallReceiver(null);
      setPeerAccepted(false); 
      setIncomingCallFrom(null);
  }, []); 

  const handleSelectContact = (contactName) => {
      setReceiver(contactName);
      setShowSidebar(false);
  };

  const startMicTest = async () => {
    setIsTesting(true);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        const pc = new RTCPeerConnection({ 
            iceServers: [
                { urls: "stun:stun.relay.metered.ca:80" },
                {
                    urls: [
                        "turn:global.relay.metered.ca:80",
                        "turn:global.relay.metered.ca:80?transport=tcp",
                        "turn:global.relay.metered.ca:443",
                        "turns:global.relay.metered.ca:443?transport=tcp"
                    ],
                    username: "d7b1ac3d94ffbf5f11d5f60f",
                    credential: "q1Q+bAyVZdzKROjh"
                }
            ] 
        });

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
                setTimeout(resolve, 2500); 
            }
        });

        const response = await fetch(`${import.meta.env.VITE_GO_WEBRTC_URL}/test-mic`, {
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(pc.localDescription)
        });
        const answer = await response.json();
        await pc.setRemoteDescription(answer);
    } catch (error) { 
        setIsTesting(false); 
        console.error("Mic Test Connection Failed:", error); 
    }
  };

  const stopMicTest = () => {
      setIsTesting(false);
      if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{ height: "100dvh", bgcolor: "#0f172a", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Paper elevation={10} sx={{ 
            width: { xs: "100%", md: "90%" }, maxWidth: "1100px", height: { xs: "100%", md: "85vh" }, 
            display: "flex", overflow: "hidden", borderRadius: { xs: 0, md: 3 }, border: { xs: "none", md: "1px solid #334155" } 
        }}>
            <Box sx={{ 
                width: { xs: "100%", md: "30%" }, 
                display: { xs: showSidebar ? "flex" : "none", md: "flex" },
                borderRight: { xs: "none", md: "1px solid #334155" }, 
                bgcolor: "#1e293b", flexDirection: "column" 
            }}>
                <Box sx={{ p: 2, bgcolor: "#0f172a", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #334155" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Avatar sx={{ bgcolor: "#3b82f6" }}>{user[0]?.toUpperCase()}</Avatar>
                        <Typography variant="subtitle1" fontWeight="bold" color="white">{user}</Typography>
                    </Box>
                    <IconButton onClick={() => setIsMicOpen(true)} sx={{ color: "#94a3b8" }}><MicIcon /></IconButton>
                </Box>
                <List sx={{ overflowY: "auto", flexGrow: 1 }}>
                    {userList.map((contact) => (
                        <ListItemButton key={contact} selected={receiver === contact}
                            onClick={() => handleSelectContact(contact)}
                            sx={{ borderRadius: 2, mx: 1, mb: 0.5, color: "white", "&.Mui-selected": { bgcolor: "#334155" } }}>
                            <ListItemAvatar><Avatar sx={{ bgcolor: receiver === contact ? "#3b82f6" : "#64748b" }}>{contact[0]}</Avatar></ListItemAvatar>
                            <ListItemText primary={contact} />
                            <CircleIcon sx={{ fontSize: 10, color: "#22c55e" }} />
                        </ListItemButton>
                    ))}
                </List>
            </Box>

            <Box sx={{ width: { xs: "100%", md: "70%" }, display: { xs: showSidebar ? "none" : "flex", md: "flex" }, flexDirection: "column", bgcolor: "#0b1120" }}> 
                {receiver ? (
                    <>
                        <Box sx={{ p: 2, bgcolor: "#1e293b", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <IconButton onClick={() => setShowSidebar(true)} sx={{ display: { xs: "flex", md: "none" }, color: "white" }}><ArrowBackIcon /></IconButton>
                                <Avatar sx={{ width: 40, height: 40, bgcolor: "#3b82f6" }}>{receiver[0]}</Avatar>
                                <Typography variant="h6" color="white">{receiver}</Typography>
                            </Box>
                            <IconButton onClick={handleStartCall} sx={{ color: "#22c55e" }}><PhoneIcon /></IconButton>
                        </Box>

                        <Box sx={{ 
                            flexGrow: 1, p: 3, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1.5,
                            '&::-webkit-scrollbar': { width: '8px' },
                            '&::-webkit-scrollbar-track': { background: '#0b1120' },
                            '&::-webkit-scrollbar-thumb': { background: '#334155', borderRadius: '10px' },
                        }}>
                            {messages.map((msg) => (
                                <Box key={msg.id} sx={{ alignSelf: msg.isMe ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                                    <Paper sx={{ p: 1.5, px: 2, bgcolor: msg.isMe ? "#1d4ed8" : "#334155", color: "white", borderRadius: msg.isMe ? "15px 15px 0px 15px" : "15px 15px 15px 0px" }}>
                                        <Typography variant="body1">{msg.text}</Typography>
                                        <Typography variant="caption" sx={{ display: "block", textAlign: "right", mt: 0.5, color: "#cbd5e1", fontSize: '0.7rem' }}>
                                            {new Date(msg.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                    </Paper>
                                </Box>
                            ))}
                            <div ref={messagesEndRef} />
                        </Box>

                        <Box sx={{ p: 2, bgcolor: "#1e293b", display: "flex", alignItems: "center", gap: 1 }}>
                            <Paper component="form" sx={{ p: "2px 4px", display: "flex", alignItems: "center", flexGrow: 1, borderRadius: 5, bgcolor: "#334155" }}>
                                <InputBase sx={{ ml: 2, flex: 1, color: "white" }} placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if(e.key === "Enter") { e.preventDefault(); handleSend(); }}} />
                            </Paper>
                            <IconButton sx={{ bgcolor: "#3b82f6", color: "white" }} onClick={handleSend}><SendIcon /></IconButton>
                        </Box>
                    </>
                ) : <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Typography color="#94a3b8">Select a conversation</Typography></Box>}
            </Box>
        </Paper>
      </Box>

      {/* CALL DIALOGS */}
      <Dialog open={!!incomingCallFrom} PaperProps={{ sx: { bgcolor: "#1e293b", color: "white", borderRadius: 3 }}}>
          <DialogTitle sx={{ textAlign: "center", pt: 3 }}>Incoming Call</DialogTitle>
          <DialogContent sx={{ textAlign: "center" }}>
              <Avatar sx={{ width: 80, height: 80, bgcolor: "#3b82f6", mx: "auto", mb: 2 }}>{incomingCallFrom?.[0]?.toUpperCase()}</Avatar>
              <Typography variant="h6">{incomingCallFrom} is calling...</Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 2 }}>
              <Button variant="contained" color="error" onClick={() => { setIncomingCallFrom(null); socketRef.current.send("__CALL_DECLINED__"); }}>Decline</Button>
              <Button variant="contained" color="success" onClick={() => { setIncomingCallFrom(null); setPeerAccepted(true); setActiveCallReceiver(incomingCallFrom); socketRef.current.send("__CALL_ACCEPTED__"); }}>Accept</Button>
          </DialogActions>
      </Dialog>

      <CallModal isOpen={!!activeCallReceiver} onClose={handleEndCall} currentUser={user} receiverUser={activeCallReceiver} peerHasJoined={peerAccepted} sendSignal={(cmd) => socketRef.current?.send(cmd)} />

      <Dialog open={isMicOpen} onClose={() => { stopMicTest(); setIsMicOpen(false); }} PaperProps={{ sx: { bgcolor: "#1e293b", color: "white", minWidth: { xs: "90vw", sm: "400px" }, borderRadius: 3 }}}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Mic Test <IconButton onClick={() => { stopMicTest(); setIsMicOpen(false); }} sx={{ color: "#94a3b8" }}><CloseIcon /></IconButton></DialogTitle>
        <DialogContent>
            <audio ref={audioRef} autoPlay />
            <Box sx={{ width: "100%", height: "80px", bgcolor: "#0f172a", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isTesting ? <Typography color="#22c55e">Mic Active</Typography> : <Typography color="#64748b">Ready</Typography>}
            </Box>
            {isTesting && <LinearProgress color="success" sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ pb: 3, justifyContent: "center" }}>
            {!isTesting ? <Button variant="contained" onClick={startMicTest}>Start</Button> : <Button variant="contained" color="error" onClick={stopMicTest}>Stop</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ChatPage;
