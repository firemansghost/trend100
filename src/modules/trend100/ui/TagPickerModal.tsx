/**
 * TagPickerModal component
 * 
 * Modal drawer for selecting tags from the full list.
 * Includes search and shows selected tags at top.
 */

'use client';

import { useEffect, useState } from 'react';

interface TagPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagPickerModal({
  isOpen,
  onClose,
  availableTags,
  selectedTags,
  onTagsChange,
}: TagPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Filter tags by search query
  const filteredTags = availableTags.filter((tag) =>
    tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate selected and unselected tags
  const selectedFiltered = filteredTags.filter((tag) =>
    selectedTags.includes(tag)
  );
  const unselectedFiltered = filteredTags.filter(
    (tag) => !selectedTags.includes(tag)
  );

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearAll = () => {
    onTagsChange([]);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-zinc-900 border-2 border-zinc-700 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-zinc-100">Select Tags</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded p-1"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Selected Tags Section */}
        {selectedTags.length > 0 && (
          <div className="mb-4 pb-4 border-b border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-300">
                Selected ({selectedTags.length})
              </h3>
              <button
                onClick={clearAll}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded px-2 py-1"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFiltered.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-2 py-1 text-xs rounded border bg-zinc-700 text-zinc-100 border-zinc-600 hover:bg-zinc-600 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Available Tags Section */}
        <div className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">
            Available Tags ({filteredTags.length})
          </h3>
          {unselectedFiltered.length === 0 && searchQuery ? (
            <div className="text-sm text-zinc-500 py-4 text-center">
              No tags match "{searchQuery}"
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unselectedFiltered.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-2 py-1 text-xs rounded border bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
