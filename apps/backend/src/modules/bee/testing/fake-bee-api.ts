import type { BeeApiPort, BeeConversation, BeeTodo } from '../bee-api.port';

/** A scriptable Bee for tests: conversations by id, and a record of created todos. */
export class FakeBeeApi implements BeeApiPort {
  readonly conversations = new Map<string, BeeConversation>();
  readonly todos: BeeTodo[] = [];
  getCalls = 0;
  failTodos = false;

  addNote(
    id: string,
    text: string,
    startedAt = '2026-10-20T13:05:00.000Z',
    state = 'COMPLETED',
  ): void {
    this.conversations.set(id, {
      id,
      startedAt,
      state,
      shortSummary: null,
      summary: null,
      utterances: [{ text, speaker: 'speaker_1' }],
    });
  }

  async getConversation(id: string): Promise<BeeConversation | null> {
    this.getCalls++;
    return this.conversations.get(id) ?? null;
  }

  async createTodo(text: string, alarmAt?: string | null): Promise<BeeTodo> {
    if (this.failTodos) throw new Error('Bee unavailable');
    const todo = { id: `todo-${this.todos.length + 1}`, text, alarmAt: alarmAt ?? null };
    this.todos.push(todo);
    return todo;
  }
}
