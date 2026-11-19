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
import { ArrowLeft, CircleHelp, Redo2, Save, Undo2 } from 'lucide-react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BLOCK_TYPES, scenarioSchema, type BlockType, type Scenario } from '@chatbot/model';
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
import { Canvas } from './Canvas';
import { BlockDialog } from './block-dialog/BlockDialog';
import { EditorActionsContext, type EditorActions } from './actions';
import {
  BLOCK_NODE_TYPE,
  flowToScenario,
  pruneEdges,
  scenarioToFlow,
  type BlockNode,
  type BlockNodeData,
} from './convert';
import { layoutScenario } from './layout';
import { NODE_HEIGHT, NODE_WIDTH, snapToGrid } from './placement';
import { nodeIssues } from './validate';
import { FirstStepCard, WelcomeOverlay } from './onboarding/EmptyState';
import type { ScenarioTemplate } from './onboarding/templates';
import { NodePicker } from './picker/NodePicker';
import { addFree, addFromOutput, insertOnEdge, type GraphResult } from './picker/insertion';
import { nextBlockId } from './ids';
import { sameSnapshot, snapshotOf, useHistory, type Snapshot } from './history';
import { ShortcutsHelp } from './ShortcutsHelp';

// Выбор и размеры узлов не меняют сценарий — не считаем их несохранёнными изменениями
function isMeaningfulNodeChange(change: NodeChange<BlockNode>): boolean {
  return change.type !== 'select' && change.type !== 'dimensions';
}

// Откуда открыта панель «Что дальше?»: с выхода блока, со связи или с кнопки холста
type PickerTarget =
  | { kind: 'free' }
  | { kind: 'output'; blockId: string; output: string }
  | { kind: 'edge'; edgeId: string };

// Сценарий из одного «Старта» без связей — повод показать приветствие
function isBlankFlow(nodes: BlockNode[], edges: Edge[]): boolean {
  return nodes.length === 1 && nodes[0]!.data.type === 'ENTRY_POINT' && edges.length === 0;
}

// Фокус не в поле ввода: Tab открывает панель только с холста или «пустого» места
function isFocusOnCanvasOrBody(): boolean {
  const active = document.activeElement;
  return (
    active === document.body ||
    (active instanceof Element && active.closest('.react-flow') !== null)
  );
}

// Поля ввода, CodeMirror и окна: там Ctrl+Z работает по-своему и граф не трогает
function isUndoBlockedTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable="true"], .cm-editor, [role="dialog"], [role="menu"]',
    ) !== null
  );
}

function snapToGridPoint(point: { x: number; y: number }) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  // Окно блока: какой блок открыт и нужно ли сразу выделить его название (действие «Переименовать»)
  const [dialog, setDialog] = useState<{ id: string; focusTitle: boolean } | null>(null);
  // Оверлей «С чего начнём?» — только при первом открытии пустого сценария (флаг в памяти страницы)
  const [welcomePending, setWelcomePending] = useState(() =>
    isBlankFlow(initialFlow.nodes, initialFlow.edges),
  );
  // Актуальные значения для расчётов вне updater-функций (в них побочных эффектов быть не должно)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  // Счётчик правок графа: по нему понимаем, менялся ли граф, пока шёл запрос сохранения
  const revisionRef = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  const save = useSaveScenario(projectId);
  // Базовые снимки: начало перетаскивания и открытие окна блока (шаг — по итогу)
  const dragBaseRef = useRef<Snapshot | null>(null);
  const dialogBaseRef = useRef<Snapshot | null>(null);

  const blank = isBlankFlow(nodes, edges);
  const showWelcome = welcomePending && blank;
  const entryNode = blank ? nodes[0] : undefined;

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

  const getGraph = useCallback(() => ({ nodes: nodesRef.current, edges: edgesRef.current }), []);

  // Отмена и повтор помечают сценарий изменённым; размеры берём у уже измеренных блоков
  const restoreGraph = useCallback(
    (snapshot: Snapshot) => {
      const measuredById = new Map(nodesRef.current.map((node) => [node.id, node.measured]));
      commitNodes(
        snapshot.nodes.map((node) => {
          const measured = measuredById.get(node.id);
          return measured ? { ...node, measured } : node;
        }),
      );
      commitEdges(snapshot.edges);
      touch();
    },
    [commitNodes, commitEdges, touch],
  );

  const history = useHistory({ getGraph, restore: restoreGraph });
  const { record, pushSnapshot } = history;

  const handleNodesChange = useCallback(
    (changes: NodeChange<BlockNode>[]) => {
      if (changes.some((change) => change.type === 'remove')) record();
      const next = applyNodeChanges(changes, nodesRef.current);
      commitNodes(next);
      // Удаление блока убирает и его рёбра
      if (changes.some((change) => change.type === 'remove')) {
        commitEdges(pruneEdges(next, edgesRef.current));
      }
      if (changes.some(isMeaningfulNodeChange)) touch();
    },
    [commitNodes, commitEdges, touch, record],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((change) => change.type !== 'select')) record();
      commitEdges(applyEdgeChanges(changes, edgesRef.current));
      if (changes.some((change) => change.type !== 'select')) touch();
    },
    [commitEdges, touch, record],
  );

  const handleEdgesReplace = useCallback(
    (updater: (edges: Edge[]) => Edge[]) => {
      record();
      commitEdges(updater(edgesRef.current));
      touch();
    },
    [commitEdges, touch, record],
  );

  function applyGraph(result: GraphResult) {
    record();
    commitNodes(result.nodes);
    commitEdges(result.edges);
    touch();
  }

  // Центр видимой области холста в координатах потока (левый верхний угол нового блока)
  function visibleCenter() {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition(
      bounds
        ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
        : { x: 0, y: 0 },
    );
    return { x: center.x - NODE_WIDTH / 2, y: center.y - NODE_HEIGHT / 2 };
  }

  // Выбор блока в панели или сброс на холст: учитываем, откуда открыта панель
  function placeBlock(type: BlockType, target: PickerTarget, point?: { x: number; y: number }) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    let result: GraphResult | null;
    if (target.kind === 'output') {
      result = addFromOutput(nodes, edges, target, type, point);
    } else if (target.kind === 'edge') {
      result = insertOnEdge(nodes, edges, target.edgeId, type, point);
    } else {
      result = addFree(nodes, edges, type, point ?? visibleCenter());
    }
    if (result) applyGraph(result);
    setPicker(null);
  }

  function handleBlockDrop(rawType: string, client: { x: number; y: number }) {
    const type = BLOCK_TYPES.find((t) => t === rawType);
    if (!type || type === 'ENTRY_POINT') return;
    const target: PickerTarget = picker ?? { kind: 'free' };
    // Блок без выходов на связь не вставить — кладём его без связей
    const effective: PickerTarget =
      target.kind === 'edge' && type === 'EXIT_POINT' ? { kind: 'free' } : target;
    placeBlock(type, effective, snapToGridPoint(screenToFlowPosition(client)));
  }

  function applyTemplate(template: ScenarioTemplate) {
    setWelcomePending(false);
    if (template.id === 'empty') return;
    record();
    const flow = scenarioToFlow(template.build());
    commitNodes(flow.nodes);
    commitEdges(flow.edges);
    touch();
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 1 });
    });
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
    // Реальные измеренные размеры берём из экземпляра React Flow
    const measuredById = new Map(getNodes().map((n) => [n.id, n.measured]));
    const source = nodesRef.current.map((node) => {
      const measured = measuredById.get(node.id) ?? node.measured;
      return measured ? { ...node, measured } : node;
    });
    record();
    commitNodes(layoutScenario(source, edgesRef.current));
    touch();
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 1, duration: 200 });
    });
  }, [commitNodes, touch, fitView, getNodes, record]);

  // Окно блока: при открытии запоминаем базовый снимок, при закрытии с изменениями — один шаг
  const openDialog = useCallback((id: string, focusTitle: boolean) => {
    dialogBaseRef.current ??= snapshotOf(nodesRef.current, edgesRef.current);
    setDialog({ id, focusTitle });
  }, []);

  const closeDialog = useCallback(() => {
    const base = dialogBaseRef.current;
    dialogBaseRef.current = null;
    if (base && !sameSnapshot(base, snapshotOf(nodesRef.current, edgesRef.current))) {
      pushSnapshot(base);
    }
    setDialog(null);
  }, [pushSnapshot]);

  // Перетаскивание: шаг только если блоки действительно сдвинулись
  const handleDragStart = useCallback(() => {
    dragBaseRef.current = snapshotOf(nodesRef.current, edgesRef.current);
  }, []);

  const handleDragStop = useCallback(() => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    if (base && !sameSnapshot(base, snapshotOf(nodesRef.current, edgesRef.current))) {
      pushSnapshot(base);
    }
  }, [pushSnapshot]);

  // Действия блоков и связей для BlockNode и ScenarioEdge; задачи 4 и 5 подменяют часть из них
  const actions = useMemo<EditorActions>(
    () => ({
      // Выделяем блок и открываем его окно «Вход — Настройки — Выход»
      openBlock: (id) => {
        commitNodes(nodesRef.current.map((node) => ({ ...node, selected: node.id === id })));
        openDialog(id, false);
      },
      addFromOutput: (blockId, output) => setPicker({ kind: 'output', blockId, output }),
      insertOnEdge: (edgeId) => setPicker({ kind: 'edge', edgeId }),
      // Корзина на связи: один шаг истории; React Flow с его фильтром удаления не участвует
      removeEdge: (edgeId) => handleEdgesChange([{ type: 'remove', id: edgeId }]),
      // Копия правее и ниже со сдвигом 40, без связей, с новым id
      duplicate: (id) => {
        const current = nodesRef.current;
        const source = current.find((node) => node.id === id);
        if (!source || source.data.type === 'ENTRY_POINT') return;
        record();
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
      // Название редактируется в окне блока: открываем его с выделенным названием
      rename: (id) => {
        if (!nodesRef.current.some((node) => node.id === id)) return;
        openDialog(id, true);
      },
    }),
    [commitNodes, touch, handleNodesChange, handleEdgesChange, record, openDialog],
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

  // Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y — по code (не зависит от раскладки); поля ввода и окна не трогаем
  const { undo, redo } = history;
  const overlayOpen = dialog !== null || picker !== null;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const isUndo = event.code === 'KeyZ' && !event.shiftKey;
      const isRedo = (event.code === 'KeyZ' && event.shiftKey) || event.code === 'KeyY';
      if (!isUndo && !isRedo) return;
      if (overlayOpen || isUndoBlockedTarget(event.target)) return;
      event.preventDefault();
      if (isUndo) undo();
      else redo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, overlayOpen]);

  // Предупреждение о несохранённых изменениях: закрытие вкладки и переход по ссылкам
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Tab — открыть панель «Что дальше?», если фокус не в поле ввода
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (!isFocusOnCanvasOrBody()) return;
      event.preventDefault();
      setPicker({ kind: 'free' });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <>
      <EditorHeader name={name}>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">{ru.editor.unsaved}</span>}
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!history.canUndo}
            onClick={history.undo}
            aria-label={ru.editor.undo}
            title={`${ru.editor.undo} (Ctrl+Z)`}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!history.canRedo}
            onClick={history.redo}
            aria-label={ru.editor.redo}
            title={`${ru.editor.redo} (Ctrl+Shift+Z)`}
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setShortcutsOpen(true)}
            aria-label={ru.editor.shortcuts.open}
            title={ru.editor.shortcuts.open}
          >
            <CircleHelp className="size-4" />
          </Button>
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
        <div ref={canvasRef} className="relative min-w-0 flex-1" aria-label={ru.editor.canvas}>
          <EditorActionsContext.Provider value={actions}>
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onEdgesReplace={handleEdgesReplace}
              onAutoLayout={handleAutoLayout}
              onAddClick={() => setPicker({ kind: 'free' })}
              onBlockDrop={handleBlockDrop}
              onNodeDragStart={handleDragStart}
              onNodeDragStop={handleDragStop}
            >
              {blank && !showWelcome && entryNode && (
                <FirstStepCard
                  entry={entryNode}
                  onClick={() =>
                    setPicker({ kind: 'output', blockId: entryNode.id, output: 'default' })
                  }
                />
              )}
            </Canvas>
          </EditorActionsContext.Provider>
          {showWelcome && <WelcomeOverlay onChoose={applyTemplate} />}
        </div>
      </div>
      <BlockDialog
        nodeId={dialog?.id ?? null}
        nodes={nodes}
        edges={edges}
        focusTitle={dialog?.focusTitle ?? false}
        onChange={handleDataChange}
        onClose={closeDialog}
      />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <NodePicker
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        excluded={picker?.kind === 'edge' ? ['EXIT_POINT'] : []}
        onPick={(type) => picker && placeBlock(type, picker)}
      />
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
