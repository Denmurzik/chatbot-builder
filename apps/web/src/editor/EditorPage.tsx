import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { ArrowLeft, Save } from 'lucide-react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { scenarioSchema, type BlockType, type Scenario } from '@chatbot/model';
import { ApiError } from '@/api/client';
import { useProject, useSaveScenario } from '@/api/projects';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ru } from '@/i18n/ru';
import { BlockPalette } from './BlockPalette';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { EditorActionsContext, type EditorActions } from './actions';
import { BLOCK_META } from './block-meta';
import {
  BLOCK_NODE_TYPE,
  flowToScenario,
  pruneEdges,
  scenarioToFlow,
  type BlockNode,
  type BlockNodeData,
} from './convert';
import { layoutScenario } from './layout';
import { findFreePosition, snapToGrid } from './placement';
import { nodeIssues } from './validate';

// Выбор и размеры узлов не меняют сценарий — не считаем их несохранёнными изменениями
function isMeaningfulNodeChange(change: NodeChange<BlockNode>): boolean {
  return change.type !== 'select' && change.type !== 'dimensions';
}

// Свободный идентификатор блока: тип в нижнем регистре + номер (до 40 символов)
export function nextBlockId(type: BlockType, nodes: BlockNode[]): string {
  const base = type.toLowerCase();
  const used = new Set(nodes.map((node) => node.id));
  let n = 1;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function showIssues(title: string, issues: { path: string; message: string }[]) {
  toast.error(title, {
    description: (
      <ul className="list-disc pl-4">
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    ),
  });
}

function EditorHeader({ name, children }: { name?: string; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2">
      <Link to="/projects" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" />
        {ru.editor.back}
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{name}</h1>
      {children}
    </header>
  );
}

function ScenarioEditor({
  projectId,
  name,
  initial,
}: {
  projectId: string;
  name: string;
  initial: Scenario;
}) {
  const [initialFlow] = useState(() => scenarioToFlow(initial));
  const [nodes, setNodes] = useState<BlockNode[]>(initialFlow.nodes);
  const [edges, setEdges] = useState<Edge[]>(initialFlow.edges);
  const [dirty, setDirty] = useState(false);
  // Актуальные значения для расчётов вне updater-функций (в них побочных эффектов быть не должно)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  // Счётчик правок графа: по нему понимаем, менялся ли граф, пока шёл запрос сохранения
  const revisionRef = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const save = useSaveScenario(projectId);

  const selected = nodes.find((node) => node.selected) ?? null;

  const commitNodes = useCallback((next: BlockNode[]) => {
    nodesRef.current = next;
    setNodes(next);
  }, []);

  const commitEdges = useCallback((next: Edge[]) => {
    edgesRef.current = next;
    setEdges(next);
  }, []);

  const touch = useCallback(() => {
    revisionRef.current += 1;
    setDirty(true);
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange<BlockNode>[]) => {
      const next = applyNodeChanges(changes, nodesRef.current);
      commitNodes(next);
      // Удаление блока убирает и его рёбра
      if (changes.some((change) => change.type === 'remove')) {
        commitEdges(pruneEdges(next, edgesRef.current));
      }
      if (changes.some(isMeaningfulNodeChange)) touch();
    },
    [commitNodes, commitEdges, touch],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      commitEdges(applyEdgeChanges(changes, edgesRef.current));
      if (changes.some((change) => change.type !== 'select')) touch();
    },
    [commitEdges, touch],
  );

  const handleEdgesReplace = useCallback(
    (updater: (edges: Edge[]) => Edge[]) => {
      commitEdges(updater(edgesRef.current));
      touch();
    },
    [commitEdges, touch],
  );

  function handleAdd(type: BlockType) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center = bounds
      ? screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        })
      : { x: 0, y: 0 };
    const current = nodesRef.current;
    const position = findFreePosition(current, center);
    const node: BlockNode = {
      id: nextBlockId(type, current),
      type: BLOCK_NODE_TYPE,
      position,
      data: BLOCK_META[type].defaults(),
      selected: true,
    };
    commitNodes([...current.map((n) => ({ ...n, selected: false })), node]);
    touch();
  }

  // Правка полей: после смены options/values удаляем рёбра исчезнувших выходов
  const handleDataChange = useCallback(
    (id: string, data: BlockNodeData) => {
      const next = nodesRef.current.map((node) => (node.id === id ? { ...node, data } : node));
      commitNodes(next);
      commitEdges(pruneEdges(next, edgesRef.current));
      touch();
    },
    [commitNodes, commitEdges, touch],
  );

  // Упорядочить: раскладка слева направо по сетке и подгонка вида
  const handleAutoLayout = useCallback(() => {
    commitNodes(layoutScenario(nodesRef.current, edgesRef.current));
    touch();
    window.requestAnimationFrame(() => {
      void fitView({ maxZoom: 1, padding: 0.3, duration: 200 });
    });
  }, [commitNodes, touch, fitView]);

  // Действия блоков и связей для BlockNode и ScenarioEdge; задачи 4 и 5 подменяют часть из них
  const actions = useMemo<EditorActions>(
    () => ({
      // Пока окна блока нет — просто выделяем блок
      openBlock: (id) =>
        commitNodes(nodesRef.current.map((node) => ({ ...node, selected: node.id === id }))),
      // Панель «Что дальше?» появится в задаче 4
      addFromOutput: () => void toast.info(ru.editor.comingSoon),
      insertOnEdge: () => void toast.info(ru.editor.comingSoon),
      // Копия правее и ниже со сдвигом 40, без связей, с новым id
      duplicate: (id) => {
        const current = nodesRef.current;
        const source = current.find((node) => node.id === id);
        if (!source || source.data.type === 'ENTRY_POINT') return;
        const copy: BlockNode = {
          id: nextBlockId(source.data.type, current),
          type: BLOCK_NODE_TYPE,
          position: {
            x: snapToGrid(source.position.x + 40),
            y: snapToGrid(source.position.y + 40),
          },
          data: structuredClone(source.data),
          selected: true,
        };
        commitNodes([...current.map((node) => ({ ...node, selected: false })), copy]);
        touch();
      },
      // Удаление блока убирает и его рёбра; точку входа удалить нельзя
      remove: (id) => {
        const target = nodesRef.current.find((node) => node.id === id);
        if (!target || target.data.type === 'ENTRY_POINT') return;
        handleNodesChange([{ type: 'remove', id }]);
      },
      rename: (id) => {
        const target = nodesRef.current.find((node) => node.id === id);
        if (!target) return;
        const title = window.prompt(ru.editor.renamePrompt, target.data.title)?.trim();
        if (title) handleDataChange(id, { ...target.data, title });
      },
    }),
    [commitNodes, touch, handleNodesChange, handleDataChange],
  );

  const handleSave = useCallback(() => {
    if (save.isPending) return;
    const currentNodes = nodesRef.current;

    // Ошибки полей блоков (повторы, «else», числа) блокируют сохранение
    const blockIssues = currentNodes.flatMap((node) =>
      nodeIssues(node).map((message) => ({
        path: node.id,
        message: ru.validation.blockError(node.data.title, node.id, message),
      })),
    );
    if (blockIssues.length > 0) {
      const firstId = blockIssues[0]!.path;
      commitNodes(currentNodes.map((node) => ({ ...node, selected: node.id === firstId })));
      showIssues(ru.editor.fixErrors, blockIssues);
      return;
    }

    const scenario = flowToScenario(currentNodes, edgesRef.current);
    const parsed = scenarioSchema.safeParse(scenario);
    if (!parsed.success) {
      showIssues(
        ru.editor.invalidScenario,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    const sentRevision = revisionRef.current;
    save.mutate(scenario, {
      onSuccess: () => {
        // Если граф менялся, пока шёл запрос, изменения остаются несохранёнными
        if (revisionRef.current === sentRevision) setDirty(false);
        toast.success(ru.editor.saved);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 400 && error.issues?.length) {
          showIssues(ru.editor.invalidScenario, error.issues);
        } else {
          toast.error(ru.editor.saveError);
        }
      },
    });
  }, [save, commitNodes]);

  // Ctrl+S — сохранить; code не зависит от раскладки (в русской key = «ы»)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
        event.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  // Предупреждение о несохранённых изменениях: закрытие вкладки и переход по ссылкам
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <>
      <EditorHeader name={name}>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">{ru.editor.unsaved}</span>}
          <Tooltip>
            {/* Button в React 18 не пробрасывает ref — триггер оборачиваем в span */}
            <TooltipTrigger asChild>
              <span>
                <Button type="button" size="sm" disabled={save.isPending} onClick={handleSave}>
                  <Save className="size-4" />
                  {save.isPending ? ru.editor.saving : ru.editor.save}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{ru.editor.saveShortcut}</TooltipContent>
          </Tooltip>
        </div>
      </EditorHeader>
      <div className="flex min-h-0 flex-1">
        <BlockPalette onAdd={handleAdd} />
        <div ref={canvasRef} className="min-w-0 flex-1" aria-label={ru.editor.canvas}>
          <EditorActionsContext.Provider value={actions}>
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onEdgesReplace={handleEdgesReplace}
              onAutoLayout={handleAutoLayout}
            />
          </EditorActionsContext.Provider>
        </div>
        <Inspector node={selected} onChange={handleDataChange} />
      </div>
      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ru.editor.leaveTitle}</DialogTitle>
            <DialogDescription>{ru.editor.leaveDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => blocker.state === 'blocked' && blocker.reset()}
            >
              {ru.editor.leaveStay}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => blocker.state === 'blocked' && blocker.proceed()}
            >
              {ru.editor.leaveConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditorPage() {
  const { id = '' } = useParams();
  const { data: project, isError } = useProject(id);

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col">
        {isError ? (
          <>
            <EditorHeader />
            <p className="p-6 text-destructive">{ru.editor.loadError}</p>
          </>
        ) : !project ? (
          <>
            <EditorHeader />
            <p className="p-6 text-muted-foreground">{ru.common.loading}</p>
          </>
        ) : (
          <ReactFlowProvider>
            {/* Состояние редактора инициализируется один раз из загруженного проекта */}
            <ScenarioEditor
              key={project.id}
              projectId={project.id}
              name={project.name}
              initial={project.scenario}
            />
          </ReactFlowProvider>
        )}
      </div>
    </TooltipProvider>
  );
}
