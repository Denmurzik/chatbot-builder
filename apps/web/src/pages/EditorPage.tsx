import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useProject } from '@/api/projects';
import { ru } from '@/i18n/ru';

// Заглушка до задачи 12 (редактор сценария)
export function EditorPage() {
  const { id = '' } = useParams();
  const { data: project } = useProject(id);

  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-4 p-6">
      <Link to="/projects" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" />
        {ru.editor.back}
      </Link>
      <h1 className="text-xl font-semibold">{project?.name}</h1>
      <p className="text-muted-foreground">{ru.editor.placeholder}</p>
    </div>
  );
}
