class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // We buffer 4096 samples at a time before sending to React.
        // At 16kHz, this equals about 250 milliseconds of audio.
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bytesWritten++] = channelData[i];
                if (this.bytesWritten >= this.bufferSize) {
                    this.flush();
                }
            }
        }
        return true; // Keep the processor alive
    }

    flush() {
        // The browser captures audio in high-res Float32 (-1.0 to 1.0)
        // ElevenLabs needs standard Int16 format (-32768 to 32767). We convert it here!
        const int16Buffer = new Int16Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            let s = Math.max(-1, Math.min(1, this.buffer[i]));
            int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Blast the raw math over to React
        this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);
        this.bytesWritten = 0;
        this.buffer = new Float32Array(this.bufferSize);
    }
}

registerProcessor('pcm-processor', PCMProcessor);