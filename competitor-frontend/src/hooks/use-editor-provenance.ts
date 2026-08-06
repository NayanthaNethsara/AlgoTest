"use client";

import { useRef, useCallback } from "react";

export interface EditorProvenancePayload {
  typed_chars: number;
  pasted_chars: number;
  bulk_inserted_chars: number;
  paste_count: number;
  largest_paste: number;
  external_edits: number;
  ms_to_first_input: number;
  ms_since_last_paste: number;
}

export function useEditorProvenance() {
  const startTimeRef = useRef<number>(Date.now());
  const firstInputTimeRef = useRef<number | null>(null);
  const lastPasteTimeRef = useRef<number | null>(null);

  const statsRef = useRef<EditorProvenancePayload>({
    typed_chars: 0,
    pasted_chars: 0,
    bulk_inserted_chars: 0,
    paste_count: 0,
    largest_paste: 0,
    external_edits: 0,
    ms_to_first_input: 0,
    ms_since_last_paste: 0,
  });

  const trackContentChange = useCallback((text: string, isPasteEvent: boolean = false) => {
    const now = Date.now();
    if (firstInputTimeRef.current === null) {
      firstInputTimeRef.current = now;
      statsRef.current.ms_to_first_input = now - startTimeRef.current;
    }

    const isWindowFocused = typeof document !== "undefined" && document.hasFocus();
    if (!isWindowFocused) {
      statsRef.current.external_edits += 1;
    }

    const charCount = text.length;

    if (isPasteEvent || charCount > 50) {
      statsRef.current.pasted_chars += charCount;
      statsRef.current.paste_count += 1;
      if (charCount > statsRef.current.largest_paste) {
        statsRef.current.largest_paste = charCount;
      }
      if (charCount > 50) {
        statsRef.current.bulk_inserted_chars += charCount;
      }
      lastPasteTimeRef.current = now;
    } else {
      statsRef.current.typed_chars += charCount;
    }
  }, []);

  const getProvenancePayload = useCallback((): EditorProvenancePayload => {
    const now = Date.now();
    return {
      ...statsRef.current,
      ms_to_first_input: firstInputTimeRef.current
        ? firstInputTimeRef.current - startTimeRef.current
        : 0,
      ms_since_last_paste: lastPasteTimeRef.current
        ? now - lastPasteTimeRef.current
        : 0,
    };
  }, []);

  const resetProvenance = useCallback(() => {
    startTimeRef.current = Date.now();
    firstInputTimeRef.current = null;
    lastPasteTimeRef.current = null;
    statsRef.current = {
      typed_chars: 0,
      pasted_chars: 0,
      bulk_inserted_chars: 0,
      paste_count: 0,
      largest_paste: 0,
      external_edits: 0,
      ms_to_first_input: 0,
      ms_since_last_paste: 0,
    };
  }, []);

  return {
    trackContentChange,
    getProvenancePayload,
    resetProvenance,
  };
}
