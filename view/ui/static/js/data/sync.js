// the sync loop (technical-design.md → sync): it sends the outbox and takes the
// server's rows back, on launch, a second after a change, when the phone comes
// online or the app into view, and every 30 s while in view. a failed sync is
// silent: the light says it, the outbox waits.

export const AFTER_CHANGE = 1000;
export const EVERY = 30000;

// the sync light's states (spec → sync light)
export const SYNCED = "synced";
export const WAITING = "waiting"; // changes not on the server yet
export const OFF = "off"; // the server can't be reached

export class Syncer {
  // post sends a sync body and resolves to the server's answer, or throws.
  constructor(data, post, timers = globalThis) {
    this.data = data;
    this.post = post;
    this.timers = timers;
    this.running = null; // the sync in flight
    this.again = false; // a change came during it
    this.full = data.rev === 0; // take every row next time
    this.failed = false;
    this.listeners = new Set();
    this.soonTimer = null;
    this.onRejected = null; // called with the ops the server refused, before the truth is put back
  }

  // state is what the light shows: its status, whether a sync is in flight
  // (the window's reels spin), and how many changes wait.
  get state() {
    const pending = this.data.outbox.length;
    const status = this.failed ? OFF : pending ? WAITING : SYNCED;
    return { status, syncing: this.running !== null, pending };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }

  // sync runs one sync, or marks one to follow the one in flight. it never
  // throws: a failure is a state.
  sync() {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      this.notify();
      if (this.again) {
        this.again = false;
        this.sync();
      }
    });
    this.notify();
    return this.running;
  }

  async run() {
    const sent = [...this.data.outbox];
    const full = this.full;
    let res;
    try {
      res = await this.post({ since: full ? 0 : this.data.rev, ops: sent.map(({ seq, ...op }) => op) });
    } catch {
      this.failed = true;
      return;
    }
    this.failed = false;
    if (res.rejected.length) this.onRejected?.(sent.filter((op) => res.rejected.includes(op.op)));
    await this.data.took(sent, res, full);
    // a rejected op may have left a row the server never took: take all of
    // them once, so the phone holds the truth
    this.full = res.rejected.length > 0;
    if (this.full) this.again = true;
  }

  // soon syncs a second after the last of a burst of changes.
  soon() {
    this.timers.clearTimeout(this.soonTimer);
    this.soonTimer = this.timers.setTimeout(() => this.sync(), AFTER_CHANGE);
    this.notify();
  }

  // start wires the loop to the page: launch, changes, online, visible, and
  // every 30 s while visible.
  start(win, doc) {
    this.data.subscribe((local) => (local ? this.soon() : this.notify()));
    win.addEventListener("online", () => this.sync());
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "visible") this.sync();
    });
    this.timers.setInterval(() => {
      if (doc.visibilityState === "visible") this.sync();
    }, EVERY);
    return this.sync();
  }
}

// post is the real one: the server's /api/sync.
export async function post(body) {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("sync: " + res.status);
  return res.json();
}
