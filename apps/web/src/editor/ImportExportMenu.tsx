import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useExportScenario } from '@/api/import-export';
import { Button } from '@/components/ui/button';
import { ru } from '@/i18n/ru';
import { ImportDialog } from './ImportDialog';

export interface ImportExportMenuProps {
  projectId: string;
  projectName: string;
  dirty: boolean;
  disabled?: boolean;
  onSaveBeforeExport: () => Promise<boolean>;
  onImported: () => Promise<void> | void;
}

// Кнопки экспорта и импорта сценария в шапке редактора
export function ImportExportMenu({
  projectId,
  projectName,
  dirty,
  disabled = false,
  onSaveBeforeExport,
  onImported,
}: ImportExportMenuProps) {
  const [importOpen, setImportOpen] = useState(false);
  const exportMutation = useExportScenario(projectId, projectName);

  async function handleExport() {
    if (disabled || exportMutation.isPending) return;
    if (dirty) {
      const saved = await onSaveBeforeExport();
      if (!saved) return;
    }
    try {
      await exportMutation.mutateAsync();
    } catch {
      toast.error(ru.importExport.exportError);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || exportMutation.isPending}
        onClick={() => void handleExport()}
      >
        <Download className="size-4" />
        {exportMutation.isPending ? ru.importExport.exporting : ru.importExport.export}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setImportOpen(true)}
      >
        <Upload className="size-4" />
        {ru.importExport.import}
      </Button>
      <ImportDialog
        projectId={projectId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onImported}
      />
    </>
  );
}
