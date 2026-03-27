import { parsePtyId } from '@shared/ptyId';

export function getKnowledgeTaskIdFromSessionId(sessionId: string): string | null {
  const parsed = parsePtyId(sessionId);
  if (parsed) {
    return parsed.kind === 'main' ? parsed.suffix : null;
  }

  const parts = sessionId.split(':').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] || null : null;
}
