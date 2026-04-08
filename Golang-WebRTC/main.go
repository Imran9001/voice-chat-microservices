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
	activeStreams = make(map[string]*webrtc.TrackLocalStaticRTP)
	streamMutex   sync.Mutex
)

// getOrCreateStream gives every user their own dedicated audio track
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
		panic(err)
	}

	activeStreams[streamID] = newTrack
	fmt.Printf("️Created new audio stream: %s\n", streamID)
	return newTrack
}

func main() {
	http.HandleFunc("/api/webrtc/publish", handlePublish)     // Send mic audio
	http.HandleFunc("/api/webrtc/subscribe", handleSubscribe) // Listen to other person audio
	http.HandleFunc("/api/webrtc/test-mic", handleTestMic)    // The 3-second echo

	fmt.Println("Go WebRTC Router is running on port 8081")
	if err := http.ListenAndServe(":8081", nil); err != nil {
		panic(err)
	}
}

func handlePublish(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}

	streamID := r.URL.Query().Get("streamID")
	if streamID == "" {
		http.Error(w, "streamID is required", http.StatusBadRequest)
		return
	}

	var offer webrtc.SessionDescription
	if err := json.NewDecoder(r.Body).Decode(&offer); err != nil {
		return
	}

	streamTrack := getOrCreateStream(streamID)

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		panic(err)
	}

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		fmt.Printf("📡 Receiving live audio for [%s]\n", streamID)
		buf := make([]byte, 1500)
		for {
			n, _, err := track.Read(buf)
			if err != nil {
				fmt.Printf("Stopped receiving audio for [%s]\n", streamID)
				return
			}
			streamTrack.Write(buf[:n])
		}
	})

	completeHandshake(w, peerConnection, offer)
}

func handleSubscribe(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}

	streamID := r.URL.Query().Get("streamID")
	if streamID == "" {
		http.Error(w, "streamID is required", http.StatusBadRequest)
		return
	}

	var offer webrtc.SessionDescription
	if err := json.NewDecoder(r.Body).Decode(&offer); err != nil {
		return
	}

	streamTrack := getOrCreateStream(streamID)

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		panic(err)
	}

	rtpSender, err := peerConnection.AddTrack(streamTrack)
	if err != nil {
		panic(err)
	}

	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, err := rtpSender.Read(rtcpBuf); err != nil {
				fmt.Printf("🎧 Listener left [%s]\n", streamID)
				return
			}
		}
	}()

	completeHandshake(w, peerConnection, offer)
}

func handleTestMic(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}
	var offer webrtc.SessionDescription
	json.NewDecoder(r.Body).Decode(&offer)

	peerConnection, _ := webrtc.NewPeerConnection(webrtc.Configuration{})
	outputTrack, _ := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus}, "audio", "pion")
	rtpSender, _ := peerConnection.AddTrack(outputTrack)

	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, err := rtpSender.Read(rtcpBuf); err != nil {
				return
			}
		}
	}()

	peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		buf := make([]byte, 1500)
		for {
			n, _, err := track.Read(buf)
			if err != nil {
				return
			}
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

func completeHandshake(w http.ResponseWriter, pc *webrtc.PeerConnection, offer webrtc.SessionDescription) {
	pc.SetRemoteDescription(offer)
	answer, _ := pc.CreateAnswer(nil)
	pc.SetLocalDescription(answer)
	<-webrtc.GatheringCompletePromise(pc)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pc.LocalDescription())
}
