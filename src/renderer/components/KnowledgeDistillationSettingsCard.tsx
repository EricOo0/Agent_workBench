import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useAppSettings } from '@/contexts/AppSettingsProvider';
import { DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT } from '@shared/knowledge/distillationPrompt';

const KnowledgeDistillationSettingsCard: React.FC = () => {
  const { settings, updateSettings, isLoading: loading, isSaving: saving } = useAppSettings();

  const distillationPrompt = useMemo(() => {
    const configured = settings?.knowledge?.distillationPrompt;
    return typeof configured === 'string' && configured.trim()
      ? configured
      : DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT;
  }, [settings?.knowledge?.distillationPrompt]);

  const [promptDraft, setPromptDraft] = useState(distillationPrompt);

  useEffect(() => {
    setPromptDraft(distillationPrompt);
  }, [distillationPrompt]);

  const handlePromptBlur = () => {
    const nextPrompt = promptDraft.trim() || DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT;
    if (nextPrompt === distillationPrompt) {
      if (promptDraft !== distillationPrompt) {
        setPromptDraft(distillationPrompt);
      }
      return;
    }
    updateSettings({ knowledge: { distillationPrompt: nextPrompt } });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-muted p-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">Knowledge distillation prompt</p>
        <p className="text-sm text-muted-foreground">
          Controls the instructions used when Workbench summarizes a completed session into
          knowledge cards.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="knowledge-distillation-prompt" className="text-sm font-medium">
            Distillation prompt
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={loading || saving}
            onClick={() => {
              setPromptDraft(DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT);
              updateSettings({
                knowledge: {
                  distillationPrompt: DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT,
                },
              });
            }}
          >
            Reset
          </Button>
        </div>
        <Textarea
          id="knowledge-distillation-prompt"
          value={promptDraft}
          disabled={loading || saving}
          onChange={(event) => setPromptDraft(event.target.value)}
          onBlur={handlePromptBlur}
          rows={10}
          className="min-h-[220px] resize-y"
        />
        <p className="text-xs text-muted-foreground">
          Runtime context such as task name, session id, durations, snapshot, and conversations is
          still appended automatically by the app.
        </p>
      </div>
    </div>
  );
};

export default KnowledgeDistillationSettingsCard;
