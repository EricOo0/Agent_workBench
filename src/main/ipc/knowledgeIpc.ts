import { ipcMain } from 'electron';
import { databaseService } from '../services/DatabaseService';
import type {
  KnowledgeCardFilters,
  KnowledgeInboxFilters,
  ReviewKnowledgeCandidateArgs,
} from '../../shared/knowledge/types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleKnowledgeRequest<T>(
  run: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await run();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export function registerKnowledgeIpc(): void {
  ipcMain.handle('knowledge:getSessionSummary', async (_event, args: { sessionId: string }) => {
    return handleKnowledgeRequest(async () => {
      if (!args?.sessionId) {
        throw new Error('Session ID is required.');
      }
      return databaseService.getKnowledgeSessionSummary(args.sessionId);
    });
  });

  ipcMain.handle(
    'knowledge:listCandidates',
    async (_event, args?: { filters?: KnowledgeInboxFilters }) => {
      return handleKnowledgeRequest(() =>
        databaseService.listKnowledgeCandidates(args?.filters ?? {})
      );
    }
  );

  ipcMain.handle(
    'knowledge:reviewCandidate',
    async (_event, args: ReviewKnowledgeCandidateArgs | undefined) => {
      return handleKnowledgeRequest(async () => {
        if (!args?.candidateId) {
          throw new Error('Candidate ID is required.');
        }

        let candidate = null;
        switch (args.action) {
          case 'promote':
            if (!args.card) {
              throw new Error('A promotion card payload is required for promote actions.');
            }
            candidate = await databaseService.promoteKnowledgeCandidate({
              candidateId: args.candidateId,
              card: args.card,
              reviewedBy: args.reviewedBy ?? null,
            });
            break;
          case 'reject':
            candidate = await databaseService.rejectKnowledgeCandidate(
              args.candidateId,
              args.reviewedBy ?? null
            );
            break;
          case 'archive':
            candidate = await databaseService.archiveKnowledgeCandidate(args.candidateId);
            break;
          default: {
            const unsupportedAction = (args as { action?: string }).action;
            throw new Error(`Unsupported knowledge review action: ${unsupportedAction}`);
          }
        }

        if (!candidate) {
          throw new Error(`Knowledge candidate ${args.candidateId} not found.`);
        }

        return candidate;
      });
    }
  );

  ipcMain.handle(
    'knowledge:listCards',
    async (_event, args?: { filters?: KnowledgeCardFilters }) => {
      return handleKnowledgeRequest(() => databaseService.listKnowledgeCards(args?.filters ?? {}));
    }
  );

  ipcMain.handle(
    'knowledge:getOverview',
    async (_event, args?: { filters?: KnowledgeInboxFilters }) => {
      return handleKnowledgeRequest(() =>
        databaseService.getKnowledgeOverviewAggregates(args?.filters ?? {})
      );
    }
  );
}
