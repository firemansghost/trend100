/**
 * DemoBadge component
 * 
 * Displays a subtle but clear indicator when in demo/mock mode.
 */

export function DemoBadge() {
  return (
    <div className="bg-amber-600/20 border-t border-amber-500/30 px-4 py-2">
      <div className="container mx-auto flex items-center justify-center gap-2 text-xs text-amber-300">
        <span className="font-semibold">DEMO MODE</span>
        <span className="text-amber-400/80">— mock data (real pricing coming soon)</span>
      </div>
    </div>
  );
}
