/**
 * The slice of Bee's developer API Obrigada uses (decision 0012). One port, two
 * adapters: HTTP against the caregiver's Bee account, and a mock for dev and demo.
 *
 * Privacy (rule #1): Bee never sends us audio and we never ask for it. A conversation
 * arrives as text (transcript utterances and Bee's own summaries).
 */
export const BEE_API_PORT = Symbol('BEE_API_PORT');

export interface BeeUtterance {
  text: string;
  speaker: string | null;
}

export interface BeeConversation {
  id: string;
  /** When the conversation started (ISO 8601). Relative dates resolve against this. */
  startedAt: string | null;
  /** Bee's lifecycle state, e.g. CAPTURING / PROCESSING / COMPLETED, when reported. */
  state: string | null;
  shortSummary: string | null;
  summary: string | null;
  utterances: BeeUtterance[];
}

export interface BeeTodo {
  id: string;
  text: string;
  alarmAt: string | null;
}

export interface BeeApiPort {
  /** The conversation with its transcript, or null when Bee does not know it. */
  getConversation(id: string): Promise<BeeConversation | null>;
  /** Creates a todo on the caregiver's Bee (and wrist), optionally with an alarm. */
  createTodo(text: string, alarmAt?: string | null): Promise<BeeTodo>;
}
