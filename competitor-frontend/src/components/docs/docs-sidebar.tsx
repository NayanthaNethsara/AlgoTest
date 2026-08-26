import React from "react";
import Link from "next/link";
import { Layers, ArrowRight } from "lucide-react";
import type { LanguageDoc, LanguageSlug } from "@/lib/docs/types";
import {
  CppIcon,
  PythonIcon,
  JavaScriptIcon,
} from "@/components/icons/language-icons";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  currentLanguage: LanguageDoc;
  allLanguages: LanguageDoc[];
}

export function DocsSidebar({
  currentLanguage,
  allLanguages,
}: DocsSidebarProps) {
  const getLanguageIcon = (slug: LanguageSlug) => {
    switch (slug) {
      case "cpp":
        return <CppIcon className="h-4 w-4" />;
      case "python":
        return <PythonIcon className="h-4 w-4" />;
      case "javascript":
        return <JavaScriptIcon className="h-4 w-4" />;
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4 font-mono sticky top-4">
      {/* Language Switcher */}
      <div className="pixel-raised bg-card p-3.5 space-y-2">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b-2 border-border/50">
          Select Language
        </div>
        <div className="flex flex-col gap-1.5">
          {allLanguages.map((lang) => {
            const isActive = lang.slug === currentLanguage.slug;
            return (
              <Link
                key={lang.slug}
                href={`/docs/${lang.slug}`}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer select-none",
                  isActive
                    ? "pixel-flat bg-primary text-primary-foreground font-bold"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center gap-2">
                  {getLanguageIcon(lang.slug)}
                  <span>{lang.name}</span>
                </div>
                <span className="text-[10px] opacity-75">{lang.version}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Table of Contents for Current Language */}
      <div className="pixel-raised bg-card p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 text-[11px] font-bold text-foreground uppercase tracking-wider pb-1.5 border-b-2 border-border/50">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>{currentLanguage.name} Topics</span>
        </div>

        <nav className="flex flex-col gap-1 text-xs">
          {currentLanguage.topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => scrollToSection(topic.id)}
              className="w-full flex items-center justify-between text-left px-2 py-1.5 font-bold text-foreground hover:bg-muted/60 transition-colors group cursor-pointer text-xs"
            >
              <span className="truncate">{topic.title}</span>
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0 ml-1" />
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
