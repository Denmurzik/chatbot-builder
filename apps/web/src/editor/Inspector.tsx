import { useState, type ReactNode } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import {
  ERROR_STRATEGIES,
  HTTP_METHODS,
  type ErrorStrategy,
  type HttpHeader,
  type HttpMethod,
  type ResponseMapping,
} from '@chatbot/model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ru } from '@/i18n/ru';
import { BLOCK_META } from './block-meta';
import type { BlockNode, BlockNodeData } from './convert';
import { listIssues, minIssue } from './validate';

interface InspectorProps {
  node: BlockNode | null;
  onChange: (id: string, data: BlockNodeData) => void;
}

function Field({
  label,
  hint,
  errors = [],
  children,
}: {
  label: string;
  hint?: string;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors.map((error) => (
        <p key={error} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  // Сырой текст храним локально, чтобы поле можно было очистить
  const [raw, setRaw] = useState(String(value));
  const issue = minIssue(value, min);
  return (
    <Field label={label} errors={issue ? [issue] : []}>
      <Input
        type="number"
        value={raw}
        aria-invalid={issue !== null}
        onChange={(event) => {
          setRaw(event.target.value);
          const parsed = Number.parseInt(event.target.value, 10);
          onChange(Number.isNaN(parsed) ? 0 : parsed);
        }}
      />
    </Field>
  );
}

// Список значений «по строке на значение»: сырой текст храним локально,
// чтобы ввод перевода строки не терялся при фильтрации пустых строк
function LinesField({
  label,
  hint,
  value,
  forbidden,
  onChange,
}: {
  label: string;
  hint: string;
  value: string[];
  forbidden?: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join('\n'));
  // Хвостовые пустые строки (только что нажатый Enter) ошибкой не считаем
  const lines = raw.split('\n').map((line) => line.trim());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const errors = listIssues(lines, forbidden);
  return (
    <Field label={label} hint={hint} errors={errors}>
      <Textarea
        value={raw}
        rows={5}
        aria-invalid={errors.length > 0}
        onChange={(event) => {
          setRaw(event.target.value);
          onChange(
            event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          );
        }}
      />
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function HeadersEditor({
  value,
  onChange,
}: {
  value: HttpHeader[];
  onChange: (value: HttpHeader[]) => void;
}) {
  const update = (index: number, patch: Partial<HttpHeader>) =>
    onChange(value.map((header, i) => (i === index ? { ...header, ...patch } : header)));
  return (
    <Field label={ru.fields.headers}>
      {value.map((header, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-md border p-2">
          <Input
            placeholder={ru.fields.headerName}
            value={header.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Input
            placeholder={ru.fields.headerValue}
            value={header.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={header.secret}
                onChange={(event) => update(index, { secret: event.target.checked })}
              />
              {ru.fields.headerSecret}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={ru.fields.remove}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { name: '', value: '', secret: false }])}
      >
        <Plus className="size-4" />
        {ru.fields.addHeader}
      </Button>
    </Field>
  );
}

function MappingsEditor({
  value,
  onChange,
}: {
  value: ResponseMapping[];
  onChange: (value: ResponseMapping[]) => void;
}) {
  const update = (index: number, patch: Partial<ResponseMapping>) =>
    onChange(value.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));
  return (
    <Field label={ru.fields.responseMappings}>
      {value.map((mapping, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-md border p-2">
          <Input
            placeholder={ru.fields.jsonPath}
            value={mapping.jsonPath}
            onChange={(event) => update(index, { jsonPath: event.target.value })}
          />
          <div className="flex items-center gap-1.5">
            <Input
              placeholder={ru.fields.mappingVariable}
              value={mapping.variableName}
              onChange={(event) => update(index, { variableName: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={ru.fields.remove}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { jsonPath: '', variableName: '' }])}
      >
        <Plus className="size-4" />
        {ru.fields.addMapping}
      </Button>
    </Field>
  );
}

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({ value: method, label: method }));
const STRATEGY_LABELS: Record<ErrorStrategy, string> = {
  EXIT_ERROR: ru.fields.strategyExitError,
  SUSPEND: ru.fields.strategySuspend,
};
const STRATEGY_OPTIONS = ERROR_STRATEGIES.map((strategy) => ({
  value: strategy,
  label: STRATEGY_LABELS[strategy],
}));
const UNSAFE_RETRY_METHODS: readonly HttpMethod[] = ['POST', 'PUT', 'PATCH'];

// Поля, специфичные для типа блока
function TypeFields({
  data,
  onChange,
}: {
  data: BlockNodeData;
  onChange: (data: BlockNodeData) => void;
}) {
  switch (data.type) {
    case 'ENTRY_POINT':
    case 'EXIT_POINT':
      return null;
    case 'TEXT_MESSAGE':
      return (
        <AreaField
          label={ru.fields.text}
          value={data.text}
          onChange={(text) => onChange({ ...data, text })}
        />
      );
    case 'TEXT_INPUT':
      return (
        <>
          <AreaField
            label={ru.fields.question}
            value={data.question}
            onChange={(question) => onChange({ ...data, question })}
          />
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
        </>
      );
    case 'OPTION_CHOICE':
      return (
        <>
          <AreaField
            label={ru.fields.question}
            value={data.question}
            onChange={(question) => onChange({ ...data, question })}
          />
          <LinesField
            label={ru.fields.options}
            hint={ru.fields.optionsHint}
            value={data.options}
            onChange={(options) => onChange({ ...data, options })}
          />
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
        </>
      );
    case 'LIST_CHOICE':
      return (
        <>
          <AreaField
            label={ru.fields.question}
            value={data.question}
            onChange={(question) => onChange({ ...data, question })}
          />
          <TextField
            label={ru.fields.listVariable}
            value={data.listVariable}
            onChange={(listVariable) => onChange({ ...data, listVariable })}
          />
          <TextField
            label={ru.fields.labelField}
            value={data.labelField}
            onChange={(labelField) => onChange({ ...data, labelField })}
          />
          <TextField
            label={ru.fields.valueField}
            value={data.valueField}
            onChange={(valueField) => onChange({ ...data, valueField })}
          />
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
        </>
      );
    case 'ASSIGNMENT':
      return (
        <>
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
          <TextField
            label={ru.fields.expression}
            value={data.expression}
            onChange={(expression) => onChange({ ...data, expression })}
          />
        </>
      );
    case 'CONDITION':
      return (
        <TextField
          label={ru.fields.expression}
          value={data.expression}
          onChange={(expression) => onChange({ ...data, expression })}
        />
      );
    case 'SWITCH':
      return (
        <>
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
          <LinesField
            label={ru.fields.values}
            hint={ru.fields.valuesHint}
            value={data.values}
            forbidden={['else']}
            onChange={(values) => onChange({ ...data, values })}
          />
        </>
      );
    case 'HTTP_REQUEST':
      return (
        <>
          <SelectField
            label={ru.fields.method}
            value={data.method}
            options={METHOD_OPTIONS}
            onChange={(method) => onChange({ ...data, method })}
          />
          <TextField
            label={ru.fields.url}
            value={data.url}
            onChange={(url) => onChange({ ...data, url })}
          />
          <HeadersEditor
            value={data.headers}
            onChange={(headers) => onChange({ ...data, headers })}
          />
          <AreaField
            label={ru.fields.body}
            value={data.body}
            onChange={(body) => onChange({ ...data, body })}
          />
          <MappingsEditor
            value={data.responseMappings}
            onChange={(responseMappings) => onChange({ ...data, responseMappings })}
          />
          <TextField
            label={ru.fields.variableName}
            value={data.variableName}
            onChange={(variableName) => onChange({ ...data, variableName })}
          />
          <TextField
            label={ru.fields.errorVariable}
            value={data.errorVariable}
            onChange={(errorVariable) => onChange({ ...data, errorVariable })}
          />
          <NumberField
            label={ru.fields.timeoutSec}
            value={data.timeoutSec}
            min={1}
            onChange={(timeoutSec) => onChange({ ...data, timeoutSec })}
          />
          <NumberField
            label={ru.fields.retryCount}
            value={data.retryCount}
            min={0}
            onChange={(retryCount) => onChange({ ...data, retryCount })}
          />
          <NumberField
            label={ru.fields.retryIntervalSec}
            value={data.retryIntervalSec}
            min={0}
            onChange={(retryIntervalSec) => onChange({ ...data, retryIntervalSec })}
          />
          {UNSAFE_RETRY_METHODS.includes(data.method) && data.retryCount > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/50 p-2 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {ru.fields.retryWarning}
            </div>
          )}
          <SelectField
            label={ru.fields.errorStrategy}
            value={data.errorStrategy}
            options={STRATEGY_OPTIONS}
            onChange={(errorStrategy) => onChange({ ...data, errorStrategy })}
          />
          {data.errorStrategy === 'SUSPEND' && (
            <AreaField
              label={ru.fields.suspendText}
              value={data.suspendText ?? ''}
              onChange={(suspendText) =>
                onChange({ ...data, suspendText: suspendText === '' ? null : suspendText })
              }
            />
          )}
        </>
      );
  }
}

// Правая колонка: поля выбранного блока
export function Inspector({ node, onChange }: InspectorProps) {
  return (
    <aside
      data-inspector
      className="flex w-80 shrink-0 flex-col border-l bg-card"
      aria-label={ru.editor.inspector}
    >
      <h2 className="px-4 py-3 text-sm font-semibold">{ru.editor.inspector}</h2>
      <Separator />
      {node ? (
        <ScrollArea className="min-h-0 flex-1">
          {/* key: при смене блока локальное состояние полей-списков сбрасывается */}
          <div key={node.id} className="flex flex-col gap-4 p-4">
            <p className="text-xs text-muted-foreground">
              {BLOCK_META[node.data.type].label} · {ru.fields.id}: {node.id}
            </p>
            <TextField
              label={ru.fields.title}
              value={node.data.title}
              onChange={(title) => onChange(node.id, { ...node.data, title })}
            />
            <TypeFields data={node.data} onChange={(data) => onChange(node.id, data)} />
          </div>
        </ScrollArea>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">{ru.editor.inspectorEmpty}</p>
      )}
    </aside>
  );
}
