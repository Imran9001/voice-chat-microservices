from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from elevenlabs import AsyncElevenLabs, VoiceSettings
from groq import AsyncGroq
import asyncio
import io
import wave
import numpy as np
import os
from collections import deque

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

elevenlabs_client = AsyncElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

EPIC_VOICE_ID = "0CWKRX5zLmj12lDANbQk"

def normalize_audio(pcm_bytes, target_peak=0.9):
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    if samples.size == 0:
        return pcm_bytes
    peak = np.max(np.abs(samples))
    if peak == 0:
        return pcm_bytes
    scale = min((32767 * target_peak) / peak, 2.0)
    return np.clip(samples * scale, -32768, 32767).astype(np.int16).tobytes()

def boost_output_volume(pcm_bytes, multiplier=1.8):
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    if samples.size == 0:
        return pcm_bytes
    boosted = np.clip(samples * multiplier, -32768, 32767)
    return boosted.astype(np.int16).tobytes()

def create_wav_buffer(pcm_bytes, sample_rate=16000):
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    wav_io.seek(0)
    return wav_io

def get_volume(pcm_bytes):
    try:
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
        if len(samples) == 0:
            return 0
        return float(np.sqrt(np.mean(samples ** 2)))
    except Exception:
        return 0


@app.websocket("/api/ai")
async def voice_changer_endpoint(websocket: WebSocket):
    await websocket.accept()
   
    print("React connected! Calibrating noise floor...", flush=True)

    calibration_samples = []
    for _ in range(10):
        chunk = await websocket.receive_bytes()
        calibration_samples.append(get_volume(chunk))

    baseline = sum(calibration_samples) / len(calibration_samples) if calibration_samples else 500
    silence_threshold = baseline + 500
    print(f"Calibrated! Baseline: {baseline:.0f} → Threshold: {silence_threshold:.0f}", flush=True)

    silence_limit = 2
    min_phrase_bytes = 8000
    max_phrase_bytes = 16000 * 8

    pre_roll_chunks = 3
    pre_roll = deque(maxlen=pre_roll_chunks)
    pcm_buffer = bytearray()
    silence_count = 0
    is_speaking = False

    audio_queue = asyncio.Queue()

    async def pipeline_worker(wav_io):
        try:
            wav_io.seek(0)
            transcription = await groq_client.audio.transcriptions.create(
                file=("audio.wav", wav_io),
                model="whisper-large-v3-turbo",
                language="en"
            )
            transcript = transcription.text.strip()

            if not transcript:
                print("Empty transcript, skipping.", flush=True)
                return

            print(f"Transcript: '{transcript}'", flush=True)
            print("Sending to ElevenLabs TTS...", flush=True)

            async for audio_chunk in elevenlabs_client.text_to_speech.convert(
                voice_id=EPIC_VOICE_ID,
                text=transcript,
                model_id="eleven_multilingual_v2",
                output_format="pcm_16000",
                voice_settings=VoiceSettings(
                    stability=0.4,
                    similarity_boost=0.85,
                    style=0.2,
                    speed=1.0,
                    use_speaker_boost=True
                )
            ):
                if audio_chunk:
                    louder_chunk = boost_output_volume(audio_chunk, multiplier=1.8)
                    await audio_queue.put(louder_chunk)

            print("Done sending audio back to React!", flush=True)

        except Exception as e:
            print(f"Pipeline Error: {e}", flush=True)

    async def queue_sender():
        while True:
            audio_chunk = await audio_queue.get()
            if audio_chunk is None:
                break
            try:
                await websocket.send_bytes(audio_chunk)
            except Exception:
                break

    sender_task = asyncio.create_task(queue_sender())

    try:
        while True:
            chunk = await websocket.receive_bytes()
            volume = get_volume(chunk)

            if volume > silence_threshold:
                if not is_speaking:
                    print("\nStarted speaking...", flush=True)
                    for pre_chunk in pre_roll:
                        pcm_buffer.extend(pre_chunk)
                is_speaking = True
                silence_count = 0
                pcm_buffer.extend(chunk)
            else:
                pre_roll.append(chunk)
                if is_speaking:
                    silence_count += 1
                    pcm_buffer.extend(chunk)

            if is_speaking and (silence_count >= silence_limit or len(pcm_buffer) >= max_phrase_bytes):
                reason = "Paused" if silence_count >= silence_limit else "Hit Max Length"
                is_speaking = False
                silence_count = 0

                if len(pcm_buffer) >= min_phrase_bytes:
                    print(f"Phrase complete ({reason}). Processing...", flush=True)
                    normalized_audio = normalize_audio(bytes(pcm_buffer))
                    wav_io = create_wav_buffer(normalized_audio)
                    pcm_buffer.clear()
                    asyncio.create_task(pipeline_worker(wav_io))
                else:
                    pcm_buffer.clear()

    except WebSocketDisconnect:
        print("React disconnected.", flush=True)
    except Exception as e:
        print(f"Unexpected error: {e}", flush=True)
    finally:
        await audio_queue.put(None)
        await sender_task

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
