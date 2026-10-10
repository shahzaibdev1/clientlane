import type { z } from 'zod';
import type {
  actorSchema,
  commandSchema,
  workspaceSchema,
  projectSchema,
  settingsSchema,
  clientSchema,
  requestSchema,
  deliverySchema,
  versionSchema,
  changeSchema,
  milestoneSchema,
  deadlineProposalSchema,
  eventSchema,
  templateSchema,
  fileRefSchema,
  reminderSchema,
  currencySchema,
  importRowSchema,
} from './schema';
export type WorkspaceState = z.infer<typeof workspaceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Request = z.infer<typeof requestSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type DeliveryVersion = z.infer<typeof versionSchema>;
export type ChangeRequest = z.infer<typeof changeSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type DeadlineProposal = z.infer<typeof deadlineProposalSchema>;
export type ProjectEvent = z.infer<typeof eventSchema>;
export type ProjectTemplate = z.infer<typeof templateSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
export type ReminderSchedule = z.infer<typeof reminderSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type ImportProjectRow = z.infer<typeof importRowSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Actor = z.infer<typeof actorSchema>;
export type PortalProject = Omit<
  Project,
  'clientId' | 'assigneeId' | 'internalNotes' | 'createdAt'
>;
export type DashboardItem = {
  projectId: string;
  projectTitle: string;
  clientName: string;
  action: string;
  dueDate: string | null;
  delayDays: number;
  kind: 'request' | 'delivery' | 'milestone' | 'project' | 'agreement';
  itemId: string;
};
export type CsvPreview = { rows: ImportProjectRow[]; errors: { row: number; message: string }[] };
