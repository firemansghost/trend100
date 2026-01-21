/**
 * SectionPills component
 * 
 * Single-select section filter pills for deck-specific grouping.
 * Shows "All" + one pill per section with optional counts.
 */

'use client';

interface SectionPillsProps {
  sections: { id: string; label: string }[];
  selectedSection: string | null;
  onChange: (sectionId: string | null) => void;
  counts?: Record<string, number>;
}

export function SectionPills({
  sections,
  selectedSection,
  onChange,
  counts,
}: SectionPillsProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
          selectedSection === null
            ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300'
        }`}
      >
        All
      </button>
      {sections.map((section) => {
        const count = counts?.[section.id];
        const isSelected = selectedSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onChange(isSelected ? null : section.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
              isSelected
                ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
          >
            {section.label}
            {count !== undefined && (
              <span className="ml-1.5 text-zinc-500">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
