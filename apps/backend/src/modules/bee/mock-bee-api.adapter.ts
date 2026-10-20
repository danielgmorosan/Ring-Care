import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { BeeApiPort, BeeConversation, BeeTodo } from './bee-api.port';

/** The demo voice note the caregiver dictates after the GP visit. */
export const DEMO_NOTE =
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the new prescription";

/**
 * Used when BEE_API_TOKEN is not set. Any conversation id starting with "demo" returns
 * the demo note, so the full flow can be shown without a Bee account. Todos are kept in
 * memory and logged.
 */
export class MockBeeApiAdapter implements BeeApiPort {
  private readonly logger = new Logger(MockBeeApiAdapter.name);
  readonly todos: BeeTodo[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getConversation(id: string): Promise<BeeConversation | null> {
    if (!id.startsWith('demo')) return null;
    return {
      id,
      startedAt: this.now().toISOString(),
      state: 'COMPLETED',
      shortSummary: 'Notes after the GP visit',
      summary: null,
      utterances: [{ text: DEMO_NOTE, speaker: 'caregiver' }],
    };
  }

  async createTodo(text: string, alarmAt?: string | null): Promise<BeeTodo> {
    const todo: BeeTodo = { id: `mock-${uuidv4()}`, text, alarmAt: alarmAt ?? null };
    this.todos.push(todo);
    this.logger.log(`Mock Bee todo: "${text}"${alarmAt ? ` alarm ${alarmAt}` : ''}`);
    return todo;
  }
}
