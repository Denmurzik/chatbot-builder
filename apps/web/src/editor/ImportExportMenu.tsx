import { useState } from 'react';
import { ChevronDown, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { type ExportFormat, useExportScenario } from '@/api/import-export';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

// Кнопки экспорта (JSON/YAML) и импорта сценария в шапке редактора
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

  async function handleExport(format: ExportFormat) {
    if (disabled || exportMutation.isPending) return;
    if (dirty) {
      const saved = await onSaveBeforeExport();
      if (!saved) return;
    }
    try {
      await exportMutation.mutateAsync(format);
    } catch {
      toast.error(ru.importExport.exportError);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || exportMutation.isPending}
          >
            <Download className="size-4" />
            {exportMutation.isPending ? ru.importExport.exporting : ru.importExport.export}
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void handleExport('json')}>
            {ru.importExport.exportJson}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleExport('yaml')}>
            {ru.importExport.exportYaml}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
