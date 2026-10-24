// No worklet exists until the user explicitly starts voice.
class PhantomMicrophone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(2048);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input)
      for (const sample of input) {
        this.chunk[this.offset++] = sample;
        if (this.offset === this.chunk.length) {
          this.port.postMessage(this.chunk, [this.chunk.buffer]);
          this.chunk = new Float32Array(2048);
          this.offset = 0;
        }
      }
    return true;
  }
}
registerProcessor('phantom-microphone', PhantomMicrophone);
