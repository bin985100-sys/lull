/** Keep disconnected/repeated requests from spawning unlimited audio work. */
export class StreamGate {
  private active = 0;
  private queue: Array<() => void> = [];
  private jobs = new Map<string, Promise<any>>();
  constructor(private capacity = 2, private waiting = 8) {}
  state() { return { active: this.active, waiting: this.queue.length }; }
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.jobs.get(key);
    if (existing) return existing;
    if (this.active >= this.capacity && this.queue.length >= this.waiting)
      return Promise.reject(new Error('audio resolver busy; retry shortly'));
    const job = new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active--;
          this.jobs.delete(key);
          this.queue.shift()?.();
        });
      };
      if (this.active < this.capacity) start(); else this.queue.push(start);
    });
    this.jobs.set(key, job);
    return job;
  }
}
