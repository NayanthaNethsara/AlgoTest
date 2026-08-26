"use client";

import React, { useState, useMemo } from "react";
import { Search, Terminal } from "lucide-react";
import type { LanguageDoc } from "@/lib/docs/types";
import { DocsSidebar } from "./docs-sidebar";
import { DocsTopicSection } from "./docs-topic-section";

interface DocsLanguageViewProps {
  language: LanguageDoc;
  allLanguages: LanguageDoc[];
}

export function DocsLanguageView({
  language,
  allLanguages,
}: DocsLanguageViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return language.topics;

    const q = searchQuery.toLowerCase();
    return language.topics
      .map((topic) => {
        const matchesTopic =
          topic.title.toLowerCase().includes(q) ||
          topic.summary.toLowerCase().includes(q);

        const matchingItems = topic.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.syntax.toLowerCase().includes(q),
        );

        if (matchesTopic) return topic;
        if (matchingItems.length > 0) {
          return {
            ...topic,
            items: matchingItems,
          };
        }
        return null;
      })
      .filter((t): t is typeof language.topics[0] => t !== null);
  }, [language, searchQuery]);

  return (
    <div className="space-y-6 font-mono">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 pixel-raised bg-card p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center pixel-flat bg-primary text-primary-foreground">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-primary font-bold uppercase tracking-wider">
              &gt; {language.name.toUpperCase()} {"// SYNTAX_REFERENCE"}
            </div>
            <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {language.name} Language Guide
            </h1>
            <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
              {language.summary}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t-2 border-border/50 text-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            [ENVIRONMENT]
          </span>
          <span className="pixel-flat bg-muted/60 px-2 py-0.5 text-[11px] text-foreground">
            Runtime: {language.version}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="pixel-raised bg-card p-3.5 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${language.name} syntax (e.g. loops, if-else, arrays)...`}
            className="w-full pixel-inset bg-background pl-9 pr-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <DocsSidebar
          currentLanguage={language}
          allLanguages={allLanguages}
        />

        <div className="flex-1 w-full space-y-8 min-w-0">
          {filteredTopics.map((topic) => (
            <DocsTopicSection key={topic.id} topic={topic} />
          ))}

          {filteredTopics.length === 0 && (
            <div className="pixel-raised bg-card p-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">
                No matching {language.name} syntax found
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching for different keywords or clear the search query.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
