"use client";

import React from "react";
import type { DocTopic } from "@/lib/docs/types";
import { DocsSyntaxCard } from "./docs-syntax-card";

interface DocsTopicSectionProps {
  topic: DocTopic;
}

export function DocsTopicSection({ topic }: DocsTopicSectionProps) {
  return (
    <section id={topic.id} className="space-y-4 scroll-mt-6">
      <div className="flex flex-col gap-1 border-b-2 border-border pb-2">
        <h2 className="text-base sm:text-lg font-bold text-foreground font-mono">
          {topic.title}
        </h2>
        <p className="text-xs sm:text-[13px] text-muted-foreground font-mono leading-relaxed">
          {topic.summary}
        </p>
      </div>

      <div className="space-y-4">
        {topic.items.map((item) => (
          <DocsSyntaxCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
