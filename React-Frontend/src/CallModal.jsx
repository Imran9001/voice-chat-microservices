import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Avatar, Fab, Paper, LinearProgress, IconButton } from "@mui/material";
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CelebrationIcon from '@mui/icons-material/Celebration'; 
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'; 
import CampaignIcon from '@mui/icons-material/Campaign'; 
import SmartToyIcon from '@mui/icons-material/SmartToy'; 
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

import processorUrl from './processor.js?url';

function CallModal({ isOpen, onClose, currentUser, receiverUser, peerHasJoined, sendSignal }) {
    const [status, setStatus] = useState("Connecting to server...");
    const [isMuted, setIsMuted] = useState(false); 
    const [isAIActive, setIsAIActive] = useState(false);
    const [remoteVolume, setRemoteVolume] = useState(0); 
    const [isCollapsed, setIsCollapsed] = useState(false); 

    const publishPCRef = useRef(null);
    const subscribePCRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const sfxPlayerRef = useRef(new Audio());
    const peerJoinedRef = useRef(peerHasJoined);

    const aiWsRef = useRef(null);
    const audioContextRef = useRef(null);
    const aiDestinationRef = useRef(null);
    const nextPlayTimeRef = useRef(0); 
    
    const workletNodeRef = useRef(null);
    const micSourceRef = useRef(null);
    const animationFrameRef = useRef(null); 

    useEffect(() => {
        peerJoinedRef.current = peerHasJoined;
        if (peerHasJoined) setStatus("Connected!");
    }, [peerHasJoined]);

    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true; 

        const startCall = async () => {
            try {
                // iOS Audio Primer
                try {
                    const primer = new Audio();
                    primer.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
                    await primer.play();
                    primer.pause();
                } catch (_) {}

                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                });
                
                if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
                stream.getAudioTracks().forEach(track => { track.enabled = true; });
                localStreamRef.current = stream;

                // WEBRTC PUBLISH (To Go Server)
                const pubPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                publishPCRef.current = pubPC;
                stream.getTracks().forEach(track => pubPC.addTrack(track, stream));
                
                pubPC.oniceconnectionstatechange = () => {
                    if ((pubPC.iceConnectionState === "disconnected" || pubPC.iceConnectionState === "failed") && isMounted) onClose(); 
                };

                const pubOffer = await pubPC.createOffer();
                await pubPC.setLocalDescription(pubOffer);
                await waitForICE(pubPC);
                if (!isMounted) return;

                const pubResponse = await fetch(`${import.meta.env.VITE_GO_WEBRTC_URL}/publish?streamID=${currentUser}_Mic`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pubPC.localDescription)
                });
                await pubPC.setRemoteDescription(await pubResponse.json());

                // WEBRTC SUBSCRIBE (From Go Server)
                const subPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                subscribePCRef.current = subPC;
                subPC.addTransceiver('audio', { direction: 'recvonly' });

                subPC.ontrack = (event) => {
                    if (event.streams && event.streams[0]) {
                        window.persistentWebRTCStream = event.streams[0];
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = event.streams[0];
                            remoteAudioRef.current.volume = 1.0;
                            remoteAudioRef.current.play().catch(err => console.warn(err));
                        }
                        
                        // Volume Analyzer Logic
                        try {
                            const AudioContext = window.AudioContext || window.webkitAudioContext;
                            const analyzeCtx = new AudioContext();
                            const source = analyzeCtx.createMediaStreamSource(event.streams[0]);
                            const analyser = analyzeCtx.createAnalyser();
                            analyser.fftSize = 256;
                            source.connect(analyser);
                            const dataArray = new Uint8Array(analyser.frequencyBinCount);
                            const updateMeter = () => {
                                analyser.getByteFrequencyData(dataArray);
                                let sum = 0;
                                for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                                const average = sum / dataArray.length;
                                setRemoteVolume(Math.min(100, Math.round((average / 128) * 100)));
                                animationFrameRef.current = requestAnimationFrame(updateMeter);
                            };
                            updateMeter();
                        } catch (e) { console.error(e); }

                        if (isMounted) setStatus(peerJoinedRef.current ? "Connected!" : "Ringing..."); 
                    }
                };

                const subOffer = await subPC.createOffer();
                await subPC.setLocalDescription(subOffer);
                await waitForICE(subPC);
                if (!isMounted) return; 
                
                const subResponse = await fetch(`${import.meta.env.VITE_GO_WEBRTC_URL}/subscribe?streamID=${receiverUser}_Mic`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subPC.localDescription)
                });
                await subPC.setRemoteDescription(await subResponse.json());

            } catch (error) { if (isMounted) setStatus("Call Failed"); }
        };

        startCall();

        return () => {
            isMounted = false; 
            if (publishPCRef.current) publishPCRef.current.close();
            if (subscribePCRef.current) subscribePCRef.current.close();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (aiWsRef.current) aiWsRef.current.close();
            if (audioContextRef.current) audioContextRef.current.close();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            window.persistentWebRTCStream = null;
        };
    }, [isOpen, currentUser, receiverUser, onClose]); 

    const waitForICE = (pc) => new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') resolve();
        else {
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
            setTimeout(resolve, 2000);
        }
    });

    const toggleMute = () => {
        if (localStreamRef.current) {
            const tracks = localStreamRef.current.getAudioTracks();
            tracks.forEach(track => { track.enabled = !track.enabled; });
            setIsMuted(!tracks[0].enabled);
        }
    };

    const toggleAIVoice = async () => {
        if (isAIActive) {
            setIsAIActive(false);
            if (aiWsRef.current) aiWsRef.current.close();
            if (workletNodeRef.current) workletNodeRef.current.disconnect();
            if (micSourceRef.current) micSourceRef.current.disconnect();
            if (audioContextRef.current) await audioContextRef.current.close();
            audioContextRef.current = null;
            const sender = publishPCRef.current.getSenders().find(s => s.track?.kind === 'audio');
            if (sender && localStreamRef.current) sender.replaceTrack(localStreamRef.current.getAudioTracks()[0]);
        } else {
            setIsAIActive(true);
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            aiDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
            nextPlayTimeRef.current = 0;
            const sender = publishPCRef.current.getSenders().find(s => s.track?.kind === 'audio');
            if (sender) sender.replaceTrack(aiDestinationRef.current.stream.getAudioTracks()[0]);

            const ws = new WebSocket(`${import.meta.env.VITE_PYTHON_AI_URL}/ws/voice-changer`);
            aiWsRef.current = ws;
            ws.binaryType = "arraybuffer"; 
            ws.onopen = async () => {
                await audioContextRef.current.audioWorklet.addModule(processorUrl);
                micSourceRef.current = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');
                workletNodeRef.current.port.onmessage = (e) => ws.readyState === WebSocket.OPEN && ws.send(e.data);
                micSourceRef.current.connect(workletNodeRef.current);
            };
            ws.onmessage = (e) => playRawPCMChunk(e.data);
        }
    };

    const playRawPCMChunk = (arrayBuffer) => {
        if (!audioContextRef.current || !aiDestinationRef.current) return;
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768.0;
        const buffer = audioContextRef.current.createBuffer(1, float32Array.length, 16000);
        buffer.getChannelData(0).set(float32Array);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(aiDestinationRef.current);
        const startTime = Math.max(audioContextRef.current.currentTime, nextPlayTimeRef.current);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + buffer.duration;
    };

    if (!isOpen) return null;

    return (
        <Paper 
            elevation={10} 
            sx={{ 
                position: "fixed", 
                top: { xs: isCollapsed ? 10 : 'auto', sm: 'auto' },
                bottom: { xs: isCollapsed ? 'auto' : 80, sm: 30 }, 
                right: { xs: "2.5%", sm: 30 }, 
                zIndex: 9999, 
                width: { xs: "95%", sm: isCollapsed ? "280px" : "460px" },
                bgcolor: "#1e293b", color: "white", borderRadius: 4, border: "1px solid #334155",
                overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", 
                py: isCollapsed ? 1.5 : 3, 
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
                boxShadow: "0px 10px 40px rgba(0,0,0,0.6)" 
            }}
        >
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'absolute', opacity: 0 }} />
            
            <IconButton 
                onClick={() => setIsCollapsed(!isCollapsed)}
                sx={{ position: 'absolute', top: 5, right: 5, color: '#94a3b8' }}
            >
                {isCollapsed ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: isCollapsed ? 0 : 2, flexDirection: isCollapsed ? 'row' : 'column' }}>
                <Avatar sx={{ 
                    width: isCollapsed ? 35 : 80, 
                    height: isCollapsed ? 35 : 80, 
                    bgcolor: "#3b82f6", 
                    fontSize: isCollapsed ? "1rem" : "2.5rem", 
                    boxShadow: "0 0 15px #3b82f6" 
                }}>
                    {receiverUser?.[0]?.toUpperCase()}
                </Avatar>
                <Box>
                    <Typography variant={isCollapsed ? "subtitle2" : "h6"} fontWeight="bold">
                        {receiverUser}
                    </Typography>
                    {isCollapsed && <Typography variant="caption" sx={{ color: "#22c55e", display: 'block' }}>{status}</Typography>}
                </Box>
            </Box>
            
            <Box sx={{ width: isCollapsed ? '40%' : '60%', mb: isCollapsed ? 0 : 1 }}>
                {!isCollapsed && <Typography variant="caption" sx={{ color: "#94a3b8", display: 'block', textAlign: 'center', mb: 0.5 }}>Signal</Typography>}
                <LinearProgress 
                    variant="determinate" 
                    value={remoteVolume} 
                    sx={{ 
                        height: isCollapsed ? 4 : 8, borderRadius: 4, bgcolor: '#334155',
                        '& .MuiLinearProgress-bar': { bgcolor: remoteVolume > 10 ? '#22c55e' : '#64748b' }
                    }} 
                />
            </Box>
            
            {!isCollapsed && (
                <>
                    <Typography variant="body2" sx={{ color: status === "Connected!" ? "#22c55e" : "#94a3b8", mb: 3 }}>{status}</Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                        <Fab size="small" onClick={() => sendSignal("__SFX_1__")} sx={{ bgcolor: "#334155", color: "#eab308" }}><CelebrationIcon /></Fab>
                        <Fab size="small" onClick={() => sendSignal("__SFX_2__")} sx={{ bgcolor: "#334155", color: "#38bdf8" }}><NotificationsActiveIcon /></Fab>
                        <Fab size="small" onClick={() => sendSignal("__SFX_3__")} sx={{ bgcolor: "#334155", color: "#f97316" }}><CampaignIcon /></Fab>
                        <Fab size="small" onClick={toggleAIVoice} sx={{ bgcolor: isAIActive ? "#a855f7" : "#334155", color: "white" }}><SmartToyIcon /></Fab>
                        <Fab size="small" onClick={toggleMute} sx={{ bgcolor: isMuted ? "#991b1b" : "#334155", color: "white" }}>{isMuted ? <MicOffIcon /> : <MicIcon />}</Fab>
                        <Fab size="small" color="error" onClick={onClose} sx={{ px: 2, width: "auto", borderRadius: 10 }}><CallEndIcon sx={{ mr: 1 }} /> End</Fab>
                    </Box>
                </>
            )}
        </Paper>
    );
}

export default CallModal;
