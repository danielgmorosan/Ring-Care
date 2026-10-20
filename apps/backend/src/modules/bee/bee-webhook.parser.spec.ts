import { isConversationEvent, parseBeeWebhook } from './bee-webhook.parser';

describe('parseBeeWebhook', () => {
  it('reads a JSON event with a conversation object', () => {
    expect(
      parseBeeWebhook({
        event: 'new-conversation',
        data: { conversation: { id: 4242, title: 'GP' } },
      }),
    ).toEqual({ eventType: 'new-conversation', conversationId: '4242' });
    expect(
      parseBeeWebhook({ type: 'new-conversation', data: { conversation: { uuid: 'c-uuid-1' } } }),
    ).toEqual({ eventType: 'new-conversation', conversationId: 'c-uuid-1' });
  });

  it('reads update-conversation-summary with conversation_id', () => {
    expect(
      parseBeeWebhook({
        event: 'update-conversation-summary',
        data: JSON.stringify({ conversation_id: 77, short_summary: 'GP visit' }),
      }),
    ).toEqual({ eventType: 'update-conversation-summary', conversationId: '77' });
  });

  it('reads the agent-style message as text or inside a {message} template', () => {
    const line =
      'Event new-conversation: "GP visit notes" conv=8f0c1d2e-aaaa-bbbb-cccc-1234567890ab';
    const expected = {
      eventType: 'new-conversation',
      conversationId: '8f0c1d2e-aaaa-bbbb-cccc-1234567890ab',
    };
    expect(parseBeeWebhook(line)).toEqual(expected);
    expect(parseBeeWebhook({ message: line })).toEqual(expected);
    expect(parseBeeWebhook(JSON.stringify({ text: line }))).toEqual(expected);
    expect(
      parseBeeWebhook('Event update-conversation-summary: conversation_id=55 "summary"'),
    ).toEqual({
      eventType: 'update-conversation-summary',
      conversationId: '55',
    });
  });

  it('returns nulls for garbage and reports non-conversation events', () => {
    expect(parseBeeWebhook(null)).toEqual({ eventType: null, conversationId: null });
    expect(parseBeeWebhook('hello')).toEqual({ eventType: null, conversationId: null });
    const utterance = parseBeeWebhook({
      event: 'new-utterance',
      data: { utterance: { text: 'hi' }, conversation_uuid: 'abc' },
    });
    expect(utterance).toEqual({ eventType: 'new-utterance', conversationId: 'abc' });
    expect(isConversationEvent(utterance.eventType)).toBe(false);
    expect(isConversationEvent('new-conversation')).toBe(true);
  });

  it('rejects ids that are not plain identifiers', () => {
    expect(
      parseBeeWebhook({ event: 'new-conversation', data: { conversation: { id: '../../me' } } })
        .conversationId,
    ).toBeNull();
  });
});
