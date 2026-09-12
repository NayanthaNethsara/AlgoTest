export interface BatchQueueItem {
  id: string;
  baseName: string;
  inputFile: File;
  expectedFile: File;
  totalSize: number;
  points: number;
  status: "queued" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

export interface InspectModalState {
  open: boolean;
  ordinal: number;
  field: "input" | "expected";
  title: string;
  loading: boolean;
  content: string;
  error: string | null;
}
