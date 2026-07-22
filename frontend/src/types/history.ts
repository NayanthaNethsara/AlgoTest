export type SnapshotTrigger = "autosave" | "ran" | "submitted";

export type Snapshot = {
  id: string;
  at: number;
  trigger: SnapshotTrigger;
  language: string;
  code: string;
};
