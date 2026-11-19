import {
  Braces,
  CircleStop,
  Globe,
  GitBranch,
  ListChecks,
  ListTree,
  MessageSquare,
  Play,
  Split,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import { BLOCK_TYPES, type BlockType } from '@chatbot/model';
import { ru } from '@/i18n/ru';
import type { BlockNodeData } from './convert';

export interface BlockMeta {
  label: string;
  icon: LucideIcon;
  // Акцентный цвет типа блока (используется только на блоках и в палитре)
  color: string;
  defaults(): BlockNodeData;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  ENTRY_POINT: {
    label: ru.blocks.ENTRY_POINT,
    icon: Play,
    color: 'oklch(0.62 0.17 150)',
    defaults: () => ({ type: 'ENTRY_POINT', title: ru.blocks.ENTRY_POINT }),
  },
  EXIT_POINT: {
    label: ru.blocks.EXIT_POINT,
    icon: CircleStop,
    color: 'oklch(0.58 0.2 25)',
    defaults: () => ({ type: 'EXIT_POINT', title: ru.blocks.EXIT_POINT }),
  },
  TEXT_MESSAGE: {
    label: ru.blocks.TEXT_MESSAGE,
    icon: MessageSquare,
    color: 'oklch(0.62 0.16 250)',
    defaults: () => ({ type: 'TEXT_MESSAGE', title: ru.blocks.TEXT_MESSAGE, text: '' }),
  },
  TEXT_INPUT: {
    label: ru.blocks.TEXT_INPUT,
    icon: TextCursorInput,
    color: 'oklch(0.6 0.15 200)',
    defaults: () => ({
      type: 'TEXT_INPUT',
      title: ru.blocks.TEXT_INPUT,
      question: '',
      variableName: 'answer',
    }),
  },
  OPTION_CHOICE: {
    label: ru.blocks.OPTION_CHOICE,
    icon: ListChecks,
    color: 'oklch(0.6 0.18 290)',
    defaults: () => ({
      type: 'OPTION_CHOICE',
      title: ru.blocks.OPTION_CHOICE,
      question: '',
      options: ['Да', 'Нет'],
      variableName: 'choice',
    }),
  },
  LIST_CHOICE: {
    label: ru.blocks.LIST_CHOICE,
    icon: ListTree,
    color: 'oklch(0.58 0.16 320)',
    defaults: () => ({
      type: 'LIST_CHOICE',
      title: ru.blocks.LIST_CHOICE,
      question: '',
      listVariable: 'items',
      labelField: 'name',
      valueField: 'id',
      variableName: 'selected',
    }),
  },
  ASSIGNMENT: {
    label: ru.blocks.ASSIGNMENT,
    icon: Braces,
    color: 'oklch(0.55 0.04 260)',
    defaults: () => ({
      type: 'ASSIGNMENT',
      title: ru.blocks.ASSIGNMENT,
      variableName: 'value',
      expression: '',
    }),
  },
  CONDITION: {
    label: ru.blocks.CONDITION,
    icon: GitBranch,
    color: 'oklch(0.72 0.15 75)',
    defaults: () => ({ type: 'CONDITION', title: ru.blocks.CONDITION, expression: '' }),
  },
  SWITCH: {
    label: ru.blocks.SWITCH,
    icon: Split,
    color: 'oklch(0.68 0.16 55)',
    defaults: () => ({
      type: 'SWITCH',
      title: ru.blocks.SWITCH,
      variableName: 'value',
      values: ['значение1', 'значение2'],
    }),
  },
  HTTP_REQUEST: {
    label: ru.blocks.HTTP_REQUEST,
    icon: Globe,
    color: 'oklch(0.6 0.13 180)',
    defaults: () => ({
      type: 'HTTP_REQUEST',
      title: ru.blocks.HTTP_REQUEST,
      method: 'GET',
      url: '',
      headers: [],
      body: '',
      variableName: 'response',
      errorVariable: 'error',
      timeoutSec: 10,
      retryCount: 0,
      retryIntervalSec: 1,
      errorStrategy: 'EXIT_ERROR',
      suspendText: null,
      responseMappings: [],
    }),
  },
};

export const BLOCK_ORDER: readonly BlockType[] = BLOCK_TYPES;
