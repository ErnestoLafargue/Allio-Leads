/**
 * Holder live-coachen tavs, mens kundens kanal er en maskine. Genkendelsen gælder kun i starten af
 * opkaldet: rigtige kunder taler også om «telefonsvarer» og «omstilling» midt i samtalen, så når en
 * person har svaret (to almindelige replikker), slås den fra.
 *  - voicemail: tavs resten af opkaldet.
 *  - ivr: pause, til næste almindelige replik (en person har taget over).
 */
import { detectMachine } from "./triggers";

export type GateState = "unknown" | "human" | "ivr" | "voicemail";

const HUMAN_AFTER = 2;

export class MachineGate {
  state: GateState = "unknown";
  private humanLines = 0;

  /** Kaldes med kundens seneste ord (ufærdige eller færdige). Returnerer, om coachen må hjælpe. */
  onCustomer(text: string, completed: boolean): boolean {
    if (this.state === "voicemail") return false;
    if (this.state === "human") return true;
    const machine = detectMachine(text);
    if (machine) {
      this.state = machine;
      return false;
    }
    if (!completed) return this.state !== "ivr";
    this.humanLines += 1;
    this.state = this.humanLines >= HUMAN_AFTER ? "human" : "unknown";
    return true;
  }

  get silent(): boolean {
    return this.state === "ivr" || this.state === "voicemail";
  }
}
