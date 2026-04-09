class PCMProcessor extends AudioWorkletProcessor {
    // This allows React to send a Mute signal to the processor 
    // when the AI is speaking through your speakers.
    static get parameterDescriptors() {
        return [{
            name: 'isAiTalking',
            defaultValue: 0,
            minValue: 0,
            maxValue: 1
        }];
    }

    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        // 0 = Mic is Open, 1 = AI is talking (Mute Mic)
        const isAiTalking = parameters.isAiTalking ? parameters.isAiTalking[0] : 0;

        if (input.length > 0 && isAiTalking === 0) {
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
        // Convert Float32 to Int16
        const int16Buffer = new Int16Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            let s = Math.max(-1, Math.min(1, this.buffer[i]));
            int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send the raw bytes to the main thread
        this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);
        this.bytesWritten = 0;
        this.buffer = new Float32Array(this.bufferSize);
    }
}

registerProcessor('pcm-processor', PCMProcessor);
