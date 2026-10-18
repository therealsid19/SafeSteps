// Ported unchanged from the detect repo (src/rules.ts). Keep the two in sync.
import { SPEAK_RANGE, REPEAT_EVERY, VERY_CLOSE, SIDE_REPEAT } from "./config";

type Side = string | null;

/** Python's str.capitalize(): first letter upper, the rest lower. */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export class Announcer {
  lastDist: number | null = null;
  lastTime = 0;
  saidStop = false;
  lastLabel: string | null = null;
  lastSides: [Side, Side] = [null, null]; // what we last said about left/right
  lastSideTime = 0;

  /** Returns [sentence, interrupt].
   *  sentence = null  -> stay quiet
   *  interrupt = true -> cut off the current sentence first */
  decide(dist: number, now: number, speaking: boolean, label: string | null = null,
         left: Side = null, right: Side = null): [string | null, boolean] {
    // front has priority; if it has nothing to say, sides fill the silence
    let [message, interrupt] = this.frontMessage(dist, now, speaking, label);
    if (message === null) {
      message = this.sideMessage(now, speaking, left, right);
    }
    return [message, interrupt];
  }

  /** What's ahead. */
  frontMessage(dist: number, now: number, speaking: boolean, label: string | null): [string | null, boolean] {
    if (dist >= SPEAK_RANGE) {
      this.lastDist = null;
      this.saidStop = false;
      this.lastLabel = null;
      return [null, false]; // path clear -> nothing ahead (decide() asks the sides)
    }

    const rounded = Math.round(dist * 2) / 2;
    const veryClose = dist < VERY_CLOSE;
    let interrupt: boolean;

    if (speaking) {
      // only interrupt for something more urgent
      const muchCloser = this.lastDist !== null && rounded <= this.lastDist - 1.0;
      const urgent = (veryClose && !this.saidStop) || muchCloser;
      if (!urgent) return [null, false];
      interrupt = true;
    } else {
      const changed = this.lastDist === null
        || Math.abs(rounded - this.lastDist) >= 0.5
        || label !== this.lastLabel;
      const repeat = now - this.lastTime >= REPEAT_EVERY;
      if (!(changed || repeat)) return [null, false];
      interrupt = false;
    }

    this.lastDist = rounded;
    this.lastTime = now;
    this.saidStop = veryClose;
    this.lastLabel = label;

    const name = label ? capitalize(label) : "Object";
    if (veryClose) return [`Stop. ${name} very close.`, interrupt];
    return [`${name} ahead, ${rounded} meters.`, interrupt];
  }

  /** Front is quiet: mention what's beside the user, if it changed. */
  sideMessage(now: number, speaking: boolean, left: Side, right: Side): string | null {
    if (left === null && right === null) {
      this.lastSides = [left, right]; // nothing beside me: remember that
      return null;
    }

    if (speaking) return null; // never interrupt for sides

    const same = left === this.lastSides[0] && right === this.lastSides[1];
    if (same && now - this.lastSideTime < SIDE_REPEAT) return null; // same as before, too soon to repeat

    this.lastSides = [left, right];
    this.lastSideTime = now;

    if (left === "wall" && right === "wall") return "Walls on both sides.";
    const parts: string[] = [];
    if (left) parts.push(`${left} on your left`);
    if (right) parts.push(`${right} on your right`);
    return capitalize(parts.join(" and ")) + ".";
  }
}
