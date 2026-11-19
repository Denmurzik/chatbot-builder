import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { ExpressionInput } from '../fields/ExpressionInput';
import { expressionIssue } from '../validate';
import {
  conditionToExpression,
  emptyCondition,
  expressionToCondition,
  type ConditionJoin,
  type ConditionModel,
  type ConditionOperator,
  type ConditionRow,
} from './condition-model';
import { InsertableInput } from './InsertableInput';
import { useCodeMirrorInsertTarget } from './insert-target';

const t = ru.condition;

const OPERATOR_GROUPS: { label: string; operators: ConditionOperator[] }[] = [
  { label: t.groups.compare, operators: ['eq', 'neq'] },
  { label: t.groups.number, operators: ['gt', 'lt', 'gte', 'lte'] },
  { label: t.groups.empty, operators: ['empty', 'notEmpty'] },
];

// Нативный select: поддерживает группы операторов и работает с клавиатуры
function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

// Переменная в строке: имя из доступных блоков или ссылка {{env.ИМЯ}}
function isKnownVariable(name: string, variables: string[]): boolean {
  return name === '' || name.startsWith('{{env.') || variables.includes(name);
}

function RowEditor({
  row,
  index,
  variables,
  listId,
  canRemove,
  isAlive,
  onChange,
  onRemove,
}: {
  row: ConditionRow;
  index: number;
  variables: string[];
  listId: string;
  canRemove: boolean;
  isAlive: () => boolean;
  onChange: (patch: Partial<ConditionRow>) => void;
  onRemove: () => void;
}) {
  const needsValue = row.op !== 'empty' && row.op !== 'notEmpty';
  const unknown = !isKnownVariable(row.variable.trim(), variables);
  return (
    <div className="flex flex-col gap-1" data-testid="condition-row">
      <div className="flex items-center gap-1.5">
        <InsertableInput
          className="min-w-0 flex-1"
          list={listId}
          placeholder={t.variable}
          aria-label={`${t.variable} ${index + 1}`}
          value={row.variable}
          isAlive={isAlive}
          onValueChange={(variable) => onChange({ variable })}
        />
        <NativeSelect
          aria-label={`${t.operator} ${index + 1}`}
          value={row.op}
          onChange={(event) => onChange({ op: event.target.value as ConditionOperator })}
        >
          {OPERATOR_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.operators.map((op) => (
                <option key={op} value={op}>
                  {t.operators[op]}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {needsValue ? (
          <InsertableInput
            className="min-w-0 flex-1"
            placeholder={t.value}
            aria-label={`${t.value} ${index + 1}`}
            value={row.value}
            insertMode="cursor"
            isAlive={isAlive}
            onValueChange={(value) => onChange({ value })}
          />
        ) : (
          <span className="flex-1" />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.remove}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {unknown && (
        <p role="status" className="flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t.unknownVariable(row.variable.trim())}
        </p>
      )}
    </div>
  );
}

interface ConditionFieldProps {
  expression: string;
  onChange: (expression: string) => void;
  variables: string[];
}

// Условие: переключатель «Конструктор / Выражение» (как «Fixed / Expression» в n8n)
export function ConditionBuilder({ expression, onChange, variables }: ConditionFieldProps) {
  const listId = useId();
  const initial = expressionToCondition(expression);
  const [model, setModel] = useState<ConditionModel>(() => initial ?? emptyCondition());
  const [mode, setMode] = useState<'builder' | 'expression'>(initial ? 'builder' : 'expression');
  // Свежая модель для обработчиков, живущих дольше рендера (цель «Вставить»)
  const modelRef = useRef(model);
  const onCreateEditor = useCodeMirrorInsertTarget('expression');

  const commit = (next: ConditionModel) => {
    modelRef.current = next;
    setModel(next);
    onChange(conditionToExpression(next));
  };
  // Правка от свежей модели, а не от модели рендера, в котором создан обработчик
  const update = (change: (prev: ConditionModel) => ConditionModel) =>
    commit(change(modelRef.current));

  // Выражение изменили снаружи (например, отмена): пересобираем конструктор
  useEffect(() => {
    if (mode !== 'builder' || expression === conditionToExpression(modelRef.current)) return;
    const next = expressionToCondition(expression);
    if (next) {
      modelRef.current = next;
      setModel(next);
    } else {
      setMode('expression');
    }
  }, [expression, mode]);

  // Из режима «Выражение» в конструктор можно перейти, только если выражение в него укладывается
  const parsed = mode === 'expression' ? expressionToCondition(expression) : model;
  const canUseBuilder = parsed !== null;

  const switchMode = (next: 'builder' | 'expression') => {
    if (next === mode) return;
    if (next === 'builder') {
      if (!parsed) return;
      modelRef.current = parsed;
      setModel(parsed);
    }
    setMode(next);
  };

  const builderIssue = mode === 'builder' ? expressionIssue(conditionToExpression(model)) : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={t.modeLabel}
        className="inline-flex self-start rounded-md border p-0.5"
      >
        <Button
          type="button"
          size="sm"
          variant={mode === 'builder' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'builder'}
          disabled={!canUseBuilder}
          title={canUseBuilder ? undefined : t.notRepresentable}
          onClick={() => switchMode('builder')}
        >
          {t.builder}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'expression' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'expression'}
          onClick={() => switchMode('expression')}
        >
          {t.expression}
        </Button>
      </div>
      {!canUseBuilder && mode === 'expression' && (
        <p className="text-xs text-muted-foreground">{t.notRepresentable}</p>
      )}
      {mode === 'builder' ? (
        <div className="flex flex-col gap-2">
          <datalist id={listId}>
            {variables.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {model.rows.map((row, index) => (
            <RowEditor
              key={index}
              row={row}
              index={index}
              variables={variables}
              listId={listId}
              canRemove={model.rows.length > 1}
              isAlive={() => index < modelRef.current.rows.length}
              onChange={(patch) =>
                update((prev) =>
                  index < prev.rows.length
                    ? {
                        ...prev,
                        rows: prev.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
                      }
                    : prev,
                )
              }
              onRemove={() =>
                update((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }))
              }
            />
          ))}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                update((prev) => ({
                  ...prev,
                  rows: [...prev.rows, { variable: '', op: 'eq', value: '' }],
                }))
              }
            >
              <Plus className="size-4" />
              {t.add}
            </Button>
            {model.rows.length > 1 && (
              <NativeSelect
                aria-label={t.join}
                value={model.join}
                onChange={(event) =>
                  update((prev) => ({ ...prev, join: event.target.value as ConditionJoin }))
                }
              >
                <option value="and">{t.all}</option>
                <option value="or">{t.any}</option>
              </NativeSelect>
            )}
          </div>
          {builderIssue && (
            <p role="alert" className="text-xs text-destructive">
              {builderIssue}
            </p>
          )}
        </div>
      ) : (
        <ExpressionInput
          value={expression}
          onChange={onChange}
          variables={variables}
          envNames={[]}
          ariaLabel={ru.fields.expression}
          onCreateEditor={onCreateEditor}
        />
      )}
    </div>
  );
}
