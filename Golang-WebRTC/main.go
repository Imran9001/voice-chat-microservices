package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

var (
	// Global map to store audio tracks for each user
	activeStreams = make(map[string]*webrtc.TrackLocalStaticRTP)
	streamMutex   sync.Mutex
)

// getOrCreateStream retrieves an existing audio track or creates a new one for a streamID
func getOrCreateStream(streamID string) *webrtc.TrackLocalStaticRTP {
	streamMutex.Lock()
	defer streamMutex.Unlock()

	if track, exists := activeStreams[streamID]; exists {
		return track
	}

	// Create a new Opus audio track
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

// removeStream deletes a track from the map when a call ends to free memory
func removeStream(streamID string) {
	streamMutex.Lock()
	defer streamMutex.Unlock()
	if _, exists := activeStreams[streamID]; exists {
		delete(activeStreams, streamID)
		fmt.Printf("Garbage Collection: Deleted stream [%s] from memory\n", streamID)
	}
}

func main() {
	// Routes
	http.HandleFunc("/api/webrtc/publish", handlePublish)   // Receive mic audio
	http.HandleFunc("/api/webrtc/subscribe", handleSubscribe) // Send audio to listener
	http.HandleFunc("/api/webrtc/test-mic", handleTestMic)   // 3-second echo test

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

	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}

	peerConnection, err := webrtc.NewPeerConnection(config)
	if err != nil { panic(err) }

	// CRITICAL: Cleanup on Disconnect
	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("PUBLISH ICE [%s]: %s\n", streamID, state.String())
		if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			peerConnection.Close()
			removeStream(streamID) // Free memory
		}
	})

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		fmt.Printf("Receiving live audio for [%s]\n", streamID)
		buf := make([]byte, 1500)
		for {
			n, _, err := track.Read(buf)
			if err != nil {
				fmt.Printf("Inbound stream stopped for [%s]\n", streamID)
				return
			}
			streamTrack.Write(buf[:n])
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

	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}

	peerConnection, err := webrtc.NewPeerConnection(config)
	if err != nil { panic(err) }

	// CRITICAL: Cleanup on Disconnect
	peerConnection.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		fmt.Printf("SUBSCRIBE ICE [%s]: %s\n", streamID, state.String())
		if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			peerConnection.Close()
		}
	})

	rtpSender, err := peerConnection.AddTrack(streamTrack)
	if err != nil { panic(err) }

	// Read incoming RTCP (required to keep connection alive)
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
	json.NewDecoder(r.Body).Decode(&offer)

	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}

	peerConnection, _ := webrtc.NewPeerConnection(config)
	
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
			// Echo logic: Send audio back after 3 seconds
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

func completeHandshake(w http.ResponseWriter, pc *webrtc.PeerConnection, offer webrtc.SessionDescription) {
	pc.SetRemoteDescription(offer)
	answer, _ := pc.CreateAnswer(nil)
	pc.SetLocalDescription(answer)
	// Wait for ICE gathering to finish before responding
	<-webrtc.GatheringCompletePromise(pc)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pc.LocalDescription())
}
