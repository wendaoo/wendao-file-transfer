// A device has one MTP command channel. Keep it owned until the native call returns.
export default class NativeCallQueue {
  constructor() {
    this.pending = [];
    this.running = false;
  }

  enqueue(task) {
    this.pending.push(task);
    this.drain();
  }

  drain() {
    if (this.running || this.pending.length === 0) return;
    this.running = true;
    const task = this.pending.shift();
    let completed = false;

    task(() => {
      if (completed) return;
      completed = true;
      this.running = false;
      this.drain();
    });
  }
}
