import type {
  KnowledgeCard,
  KnowledgeCardFilters,
  KnowledgeCandidate,
  KnowledgeInboxFilters,
  KnowledgeOverviewPayload,
  KnowledgeSessionSummary,
  ReviewKnowledgeCandidateArgs,
} from '../../shared/knowledge/types';

async function unwrapKnowledgeResponse<T>(
  request: Promise<{ success: boolean; data?: T; error?: string }>
): Promise<T> {
  const result = await request;
  if (!result.success) {
    throw new Error(result.error || 'Knowledge request failed.');
  }
  return result.data as T;
}

export const knowledgeApi = {
  getSessionSummary(sessionId: string): Promise<KnowledgeSessionSummary | null> {
    return unwrapKnowledgeResponse(window.electronAPI.getSessionSummary({ sessionId }));
  },

  listKnowledgeCandidates(filters?: KnowledgeInboxFilters): Promise<KnowledgeCandidate[]> {
    return unwrapKnowledgeResponse(window.electronAPI.listKnowledgeCandidates({ filters }));
  },

  reviewKnowledgeCandidate(args: ReviewKnowledgeCandidateArgs): Promise<KnowledgeCandidate> {
    return unwrapKnowledgeResponse(window.electronAPI.reviewKnowledgeCandidate(args));
  },

  listKnowledgeCards(filters?: KnowledgeCardFilters): Promise<KnowledgeCard[]> {
    return unwrapKnowledgeResponse(window.electronAPI.listKnowledgeCards({ filters }));
  },

  getKnowledgeOverview(filters?: KnowledgeInboxFilters): Promise<KnowledgeOverviewPayload> {
    return unwrapKnowledgeResponse(window.electronAPI.getKnowledgeOverview({ filters }));
  },
};

export default knowledgeApi;
