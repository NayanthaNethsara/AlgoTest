export type SnapshotTrigger = "autosave" | "ran" | "submitted";

export type Snapshot = {
  id: string;
  at: number;
  trigger: SnapshotTrigger;
  language: string;
  code: string;
  verdict?: string;
  score?: number;
  maxScore?: number;
  submissionId?: string;
};

export type HistoryFilter = "all" | "submitted" | "autosave" | "ran";
