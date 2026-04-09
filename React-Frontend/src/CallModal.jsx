import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Avatar, Fab, Paper } from "@mui/material";
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CelebrationIcon from '@mui/icons-material/Celebration'; 
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'; 
import CampaignIcon from '@mui/icons-material/Campaign'; 
import SmartToyIcon from '@mui/icons-material/SmartToy'; 
import VolumeUpIcon from '@mui/icons-material/VolumeUp'; // Icon for the mobile unmute button

import processorUrl from './processor.js?url';

function CallModal({ isOpen, onClose, currentUser, receiverUser, peerHasJoined, sendSignal }) {
    const [status, setStatus] = useState("Connecting to server...");
    const [isMuted, setIsMuted] = useState(false); 
    const [isAIActive, setIsAIActive] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(true); // Tracks if the phone blocked autoplay
    
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

    useEffect(() => {
        peerJoinedRef.current = peerHasJoined;
        if (peerHasJoined) {
            setStatus("Connected!");
        }
    }, [peerHasJoined]);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true; 

        const startCall = async () => {
            try {
                // THE HOLY TRINITY
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } 
                });
                
                if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
                localStreamRef.current = stream;

                const pubPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                publishPCRef.current = pubPC;
                stream.getTracks().forEach(track => pubPC.addTrack(track, stream));
                
                pubPC.oniceconnectionstatechange = () => {
                    if (pubPC.iceConnectionState === "disconnected" || pubPC.iceConnectionState === "failed") {
                        if (isMounted) onClose(); 
                    }
                };

                const pubOffer = await pubPC.createOffer();
                await pubPC.setLocalDescription(pubOffer);
                await waitForICE(pubPC);
                if (!isMounted) return; 

                const pubResponse = await fetch(`${import.meta.env.VITE_GO_WEBRTC_URL}/publish?streamID=${currentUser}_Mic`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pubPC.localDescription)
                });
                await pubPC.setRemoteDescription(await pubResponse.json());

                const subPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                subscribePCRef.current = subPC;
                subPC.addTransceiver('audio', { direction: 'recvonly' });

                subPC.oniceconnectionstatechange = () => {
                    if (subPC.iceConnectionState === "disconnected" || subPC.iceConnectionState === "failed") {
                        if (isMounted) onClose(); 
                    }
                };

                subPC.ontrack = (event) => {
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = event.streams[0];
                        
                        // --- THE MOBILE UI FIX ---
                        // Try to play. If the browser blocks it, show the "Tap to Hear Call" button
                        remoteAudioRef.current.play().catch(err => {
                            console.warn("Mobile browser blocked autoplay. Surfacing UI button:", err);
                            if (isMounted) setAudioBlocked(true);
                        });

                        if (isMounted) {
                            setStatus(peerJoinedRef.current ? "Connected!" : "Ringing..."); 
                        }
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

            } catch (error) {
                if (isMounted) { console.error("Call failed:", error); setStatus("Call Failed"); }
            }
        };

        startCall();

        return () => {
            isMounted = false; 
            if (publishPCRef.current) publishPCRef.current.close();
            if (subscribePCRef.current) subscribePCRef.current.close();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (sfxPlayerRef.current) sfxPlayerRef.current.pause();

            if (workletNodeRef.current) workletNodeRef.current.disconnect();
            if (micSourceRef.current) micSourceRef.current.disconnect();
            if (aiWsRef.current) aiWsRef.current.close();
            if (audioContextRef.current) audioContextRef.current.close();

            setStatus("Connecting to server..."); 
            setIsMuted(false); 
            setIsAIActive(false);
            setAudioBlocked(false);
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
            localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
            setIsMuted((prev) => !prev);
        }
    };
    
    const playRawPCMChunk = (arrayBuffer) => {
        if (!audioContextRef.current || !aiDestinationRef.current) return;
        
        try {
            const byteLength = arrayBuffer.byteLength - (arrayBuffer.byteLength % 2);
            const int16Array = new Int16Array(arrayBuffer, 0, byteLength / 2);
            const float32Array = new Float32Array(int16Array.length);
            
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0; 
            }

            const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 16000);
            audioBuffer.getChannelData(0).set(float32Array);

            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(aiDestinationRef.current);

            const currentTime = audioContextRef.current.currentTime;
            if (nextPlayTimeRef.current < currentTime) {
                nextPlayTimeRef.current = currentTime;
            }
            source.start(nextPlayTimeRef.current);
            nextPlayTimeRef.current += audioBuffer.duration;
            
        } catch (e) {
            console.error("Error playing raw AI stream:", e);
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
            aiDestinationRef.current = null;

            const sender = publishPCRef.current.getSenders().find(s => s.track.kind === 'audio');
            if (sender && localStreamRef.current) {
                sender.replaceTrack(localStreamRef.current.getAudioTracks()[0]);
            }
        } else {
            setIsAIActive(true);
            
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            aiDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
            nextPlayTimeRef.current = 0;

            const sender = publishPCRef.current.getSenders().find(s => s.track.kind === 'audio');
            if (sender) { sender.replaceTrack(aiDestinationRef.current.stream.getAudioTracks()[0]); }

            const ws = new WebSocket(`${import.meta.env.VITE_PYTHON_AI_URL}/ws/voice-changer`);
            aiWsRef.current = ws;
            ws.binaryType = "arraybuffer"; 

            ws.onopen = async () => {
                try {
                    await audioContextRef.current.audioWorklet.addModule(processorUrl);
                    micSourceRef.current = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                    workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');
                    
                    workletNodeRef.current.port.onmessage = (event) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(event.data);
                        }
                    };

                    micSourceRef.current.connect(workletNodeRef.current);

                } catch (err) {
                    console.error("Failed to load AudioWorklet:", err);
                }
            };

            ws.onmessage = (event) => {
                playRawPCMChunk(event.data);
            };
        }
    };

    if (!isOpen) return null;

    return (
        <Paper 
            elevation={10} 
            sx={{ 
                position: "fixed", 
                bottom: { xs: 10, sm: 30 }, 
                right: { xs: "2.5%", sm: 30 }, 
                zIndex: 9999, 
                width: { xs: "95%", sm: "460px" },
                maxWidth: "460px",
                bgcolor: "#1e293b", color: "white", borderRadius: 4, border: "1px solid #334155",
                overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", 
                py: 3, boxShadow: "0px 10px 40px rgba(0,0,0,0.6)" 
            }}
        >
            {/* Hidden native audio player */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            
            <Avatar sx={{ width: 80, height: 80, bgcolor: "#3b82f6", fontSize: "2.5rem", mb: 2, boxShadow: "0 0 15px #3b82f6" }}>
                {receiverUser?.[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="h6" fontWeight="bold">{receiverUser}</Typography>
            <Typography variant="body2" sx={{ color: status === "Connected!" ? "#22c55e" : "#94a3b8", mb: 3 }}>{status}</Typography>

            {audioBlocked && (
                <Fab 
                    variant="extended" 
                    color="success" 
                    onClick={() => {
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.play();
                        }
                        setAudioBlocked(false); // Hide button after clicking
                    }}
                    sx={{ mb: 3, px: 4, fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}
                >
                    <VolumeUpIcon sx={{ mr: 1 }} />
                    Tap to Hear Call
                </Fab>
            )}

            <Box sx={{ display: "flex", gap: { xs: 1, sm: 1.5 }, flexWrap: "wrap", justifyContent: "center" }}>
                <Fab size="medium" onClick={() => { sfxPlayerRef.current.src = '/sfx1.mp3'; sfxPlayerRef.current.play(); sendSignal("__SFX_1__"); }} sx={{ bgcolor: "#334155", color: "#eab308", "&:hover": { bgcolor: "#475569" } }}><CelebrationIcon /></Fab>
                <Fab size="medium" onClick={() => { sfxPlayerRef.current.src = '/sfx2.mp3'; sfxPlayerRef.current.play(); sendSignal("__SFX_2__"); }} sx={{ bgcolor: "#334155", color: "#38bdf8", "&:hover": { bgcolor: "#475569" } }}><NotificationsActiveIcon /></Fab>
                <Fab size="medium" onClick={() => { sfxPlayerRef.current.src = '/sfx3.mp3'; sfxPlayerRef.current.play(); sendSignal("__SFX_3__"); }} sx={{ bgcolor: "#334155", color: "#f97316", "&:hover": { bgcolor: "#475569" } }}><CampaignIcon /></Fab>
                
                <Fab size="medium" onClick={toggleAIVoice} sx={{ bgcolor: isAIActive ? "#a855f7" : "#334155", color: "white", "&:hover": { bgcolor: isAIActive ? "#9333ea" : "#475569" }, boxShadow: isAIActive ? "0 0 15px #a855f7" : "none" }} title="Toggle Epic Voice">
                    <SmartToyIcon />
                </Fab>

                <Fab size="medium" onClick={toggleMute} sx={{ bgcolor: isMuted ? "#991b1b" : "#334155", color: isMuted ? "#fca5a5" : "white", "&:hover": { bgcolor: isMuted ? "#7f1d1d" : "#475569" } }}>
                    {isMuted ? <MicOffIcon /> : <MicIcon />}
                </Fab>

                <Fab size="medium" color="error" onClick={onClose} sx={{ px: 3, width: "auto", borderRadius: 10 }}>
                    <CallEndIcon sx={{ mr: 1 }} /> End
                </Fab>
            </Box>

            <style>
                {`
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
                }
                `}
            </style>
        </Paper>
    );
}

export default CallModal;
