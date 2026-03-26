import { describe, expect, it } from 'vitest';
import { getKnowledgeTaskIdFromSessionId } from '../../renderer/lib/knowledgeSessionRouting';

describe('getKnowledgeTaskIdFromSessionId', () => {
  it('returns the task suffix for main PTY session ids', () => {
    expect(getKnowledgeTaskIdFromSessionId('codex-main-task-123')).toBe('task-123');
  });

  it('returns null for chat PTY session ids', () => {
    expect(getKnowledgeTaskIdFromSessionId('codex-chat-conv_1')).toBeNull();
  });

  it('keeps the legacy colon-separated fallback for older session ids', () => {
    expect(getKnowledgeTaskIdFromSessionId('pty:codex:main:task-legacy')).toBe('task-legacy');
  });
});
