import { z } from 'zod';

/**
 * Claude Code JSONL session event schemas.
 * Source: empirical reverse-engineering of ~/.claude/projects/<slug>/<sessionId>.jsonl.
 * Field list may drift with new CLI versions — parser treats unknown fields as passthrough.
 */

const CommonMeta = z.object({
  uuid: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  version: z.string().optional(),
  userType: z.string().optional(),
  entrypoint: z.string().optional(),
  isSidechain: z.boolean().optional(),
});

const UserEvent = CommonMeta.extend({
  type: z.literal('user'),
  message: z.object({
    role: z.literal('user'),
    content: z.union([z.string(), z.array(z.unknown())]),
  }),
  promptId: z.string().optional(),
});

const UsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

const AssistantEvent = CommonMeta.extend({
  type: z.literal('assistant'),
  message: z.object({
    role: z.literal('assistant'),
    content: z.array(z.unknown()),
    stop_reason: z.string().nullable().optional(),
    usage: UsageSchema.optional(),
    model: z.string().optional(),
  }),
  requestId: z.string().optional(),
});

const ToolUseEvent = CommonMeta.extend({
  type: z.literal('tool_use'),
  name: z.string().optional(),
  id: z.string().optional(),
  input: z.unknown().optional(),
  caller: z.string().optional(),
});

const ToolResultEvent = CommonMeta.extend({
  type: z.literal('tool_result'),
  toolUseResult: z
    .object({
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().optional(),
      interrupted: z.boolean().optional(),
      isImage: z.boolean().optional(),
    })
    .optional(),
  message: z.unknown().optional(),
});

const SystemEvent = CommonMeta.extend({
  type: z.literal('system'),
  level: z.string().optional(),
  slug: z.string().optional(),
  subtype: z.string().optional(),
  hookCount: z.number().optional(),
  preventedContinuation: z.boolean().optional(),
  stopReason: z.string().optional(),
});

const AttachmentEvent = CommonMeta.extend({
  type: z.literal('attachment'),
  hookName: z.string().optional(),
  hookEvent: z.string().optional(),
  command: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  durationMs: z.number().optional(),
  exitCode: z.number().optional(),
});

const QueueOperationEvent = CommonMeta.extend({
  type: z.literal('queue-operation'),
  operation: z.string().optional(),
});

const PermissionModeEvent = CommonMeta.extend({
  type: z.literal('permission-mode'),
  mode: z.string().optional(),
});

const FileHistorySnapshotEvent = CommonMeta.extend({
  type: z.literal('file-history-snapshot'),
});

export const JsonlEvent = z.discriminatedUnion('type', [
  UserEvent,
  AssistantEvent,
  ToolUseEvent,
  ToolResultEvent,
  SystemEvent,
  AttachmentEvent,
  QueueOperationEvent,
  PermissionModeEvent,
  FileHistorySnapshotEvent,
]);

export type JsonlEvent = z.infer<typeof JsonlEvent>;
export type UserEvent = z.infer<typeof UserEvent>;
export type AssistantEvent = z.infer<typeof AssistantEvent>;
export type ToolUseEvent = z.infer<typeof ToolUseEvent>;
export type ToolResultEvent = z.infer<typeof ToolResultEvent>;
export type SystemEvent = z.infer<typeof SystemEvent>;

export const KNOWN_EVENT_TYPES = [
  'user',
  'assistant',
  'tool_use',
  'tool_result',
  'system',
  'attachment',
  'queue-operation',
  'permission-mode',
  'file-history-snapshot',
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];
