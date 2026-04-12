package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

var (
	// Global map to store audio tracks for each user
	activeStreams = make(map[string]*webrtc.TrackLocalStaticRTP)
	streamMutex   sync.Mutex
)

// getICEServers fetches credentials from Kubernetes Secrets (via Env Vars)
func getICEServers() []webrtc.ICEServer {
	user := os.Getenv("TURN_USERNAME")
	pass := os.Getenv("TURN_PASSWORD")

	return []webrtc.ICEServer{
		{
			URLs: []string{"stun:stun.relay.metered.ca:80"},
		},
		{
			URLs: []string{
				"turn:global.relay.metered.ca:80",
				"turn:global.relay.metered.ca:80?transport=tcp",
				"turn:global.relay.metered.ca:443",
				"turns:global.relay.metered.ca:443?transport=tcp",
			},
			Username:   user,
			Credential: pass,
		},
	}
}

// getOrCreateStream retrieves an existing audio track or creates a new one
func getOrCreateStream(streamID string) *webrtc.TrackLocalStaticRTP {
	streamMutex.Lock()
	defer streamMutex.Unlock()

	if track, exists := activeStreams[streamID]; exists {
		return track
	}

	newTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus}, "audio", "pion",
	)
	if err != nil {
		fmt.Printf("Error creating track: %v\n", err)
		return nil
	}

	activeStreams[streamID] = newTrack
	fmt.Printf("Created new audio stream: %s\n", streamID)
	return newTrack
}

func removeStream(streamID string) {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	if _, exists := activeStreams[streamID]; exists {
		delete(activeStreams, streamID)
		fmt.Printf("Garbage Collection: Deleted stream [%s] from memory\n", streamID)
	}
}

func main() {
	// API Endpoints
	http.HandleFunc("/api/webrtc/publish", handlePublish)   
	http.HandleFunc("/api/webrtc/subscribe", handleSubscribe) 
	http.HandleFunc("/api/webrtc/test-mic", handleTestMic)    

	fmt.Println("Go WebRTC Media Server running on :8081")
	if err := http.ListenAndServe(":8081", nil); err != nil {
		panic(err)
	}
}

func handlePublish(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) { return }

	streamID := r.URL.Query().Get("streamID")
	if streamID == "" {
		http.Error(w, "streamID is required", http.StatusBadRequest)
		return
	}

	var offer webrtc.SessionDescription
	if err := json.NewDecoder(r.Body).Decode(&offer); err != nil { return }

	streamTrack := getOrCreateStream(streamID)
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: getICEServers(),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("PUBLISH ICE [%s]: %s\n", streamID, state.String())
		if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			peerConnection.Close()
			removeStream(streamID)
		}
	})

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		fmt.Printf("Receiving live audio for [%s]\n", streamID)
		buf := make([]byte, 1500)
		for {
			n, _, err := track.Read(buf)
			if err != nil { return }

			safePacket := make([]byte, n)
			copy(safePacket, buf[:n])
			streamTrack.Write(safePacket)
		}
	})

	completeHandshake(w, peerConnection, offer)
}

func handleSubscribe(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) { return }

	streamID := r.URL.Query().Get("streamID")
	var offer webrtc.SessionDescription
	if err := json.NewDecoder(r.Body).Decode(&offer); err != nil { return }

	streamTrack := getOrCreateStream(streamID)
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: getICEServers(),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("SUBSCRIBE ICE [%s]: %s\n", streamID, state.String())
		if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			peerConnection.Close()
		}
	})

	rtpSender, err := peerConnection.AddTrack(streamTrack)
	if err != nil { panic(err) }

	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, err := rtpSender.Read(rtcpBuf); err != nil { return }
		}
	}()

	completeHandshake(w, peerConnection, offer)
}

func handleTestMic(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) { return }
	var offer webrtc.SessionDescription
	if err := json.NewDecoder(r.Body).Decode(&offer); err != nil { return }

	peerConnection, _ := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: getICEServers(),
	})
	
	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("TEST-MIC ICE: %s\n", state.String())
		if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed {
			peerConnection.Close()
		}
	})

	outputTrack, _ := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus}, "audio", "pion")
	rtpSender, _ := peerConnection.AddTrack(outputTrack)

	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, err := rtpSender.Read(rtcpBuf); err != nil { return }
		}
	}()

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		buf := make([]byte, 1500)
		for {
			n, _, err := track.Read(buf)
			if err != nil { return }
			packet := make([]byte, n)
			copy(packet, buf[:n])
			go func(audioData []byte) {
				time.Sleep(3 * time.Second)
				outputTrack.Write(audioData)
			}(packet)
		}
	})
	completeHandshake(w, peerConnection, offer)
}

func handleCORS(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	return r.Method == "OPTIONS"
}

// OPTIMIZED: Handshake with 1-second ICE gathering timeout
func completeHandshake(w http.ResponseWriter, pc *webrtc.PeerConnection, offer webrtc.SessionDescription) {
	pc.SetRemoteDescription(offer)
	answer, _ := pc.CreateAnswer(nil)
	pc.SetLocalDescription(answer)

	// TRICKLE ICE OPTIMIZATION:
	// We wait for candidates, but we don't wait forever.
	// 1 second is usually enough for STUN and basic TURN candidates to gather.
	select {
	case <-webrtc.GatheringCompletePromise(pc):
		// All candidates gathered successfully
	case <-time.After(1 * time.Second):
		// Timeout reached, sending partial candidate list to reduce connection delay
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pc.LocalDescription())
}
