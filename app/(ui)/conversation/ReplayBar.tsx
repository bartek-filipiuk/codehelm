'use client';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  REPLAY_SPEEDS,
  type ReplayControls,
  type ReplaySpeed,
  type ReplayState,
} from '@/hooks/use-replay';

const SPEED_LABEL: Record<ReplaySpeed, string> = {
  '1x': '1×',
  '2x': '2×',
  '5x': '5×',
  timestamps: 'real-time',
};

function isReplaySpeed(v: string): v is ReplaySpeed {
  return (REPLAY_SPEEDS as readonly string[]).includes(v);
}

/**
 * Playback controls for Replay mode. Shown above the virtualised list.
 * Scrubbing pauses the engine automatically — see useReplay.
 */
export function ReplayBar({ state, controls }: { state: ReplayState; controls: ReplayControls }) {
  const atEnd = state.revealed >= state.total && state.total > 0;
  const percent = state.total === 0 ? 0 : Math.round((state.revealed / state.total) * 100);

  return (
    <div
      className="flex items-center gap-2 border-b border-purple-900/60 bg-purple-950/30 px-4 py-2 text-xs text-neutral-200"
      role="region"
      aria-label="Replay mode controls"
    >
      <span className="inline-flex items-center rounded-full border border-purple-700 bg-purple-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-100">
        Replay
      </span>

      {atEnd ? (
        <Button size="sm" variant="outline" onClick={controls.reset} title="Replay from start">
          ↻ restart
        </Button>
      ) : (
        <Button
          size="sm"
          variant={state.playing ? 'secondary' : 'default'}
          onClick={controls.toggle}
          aria-label={state.playing ? 'Pause' : 'Play'}
          title={state.playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {state.playing ? '⏸' : '▶'}
        </Button>
      )}

      <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400">
        <span>Speed</span>
        <Select
          aria-label="Playback speed"
          value={state.speed}
          onChange={(e) => {
            const v = e.target.value;
            if (isReplaySpeed(v)) controls.setSpeed(v);
          }}
        >
          {REPLAY_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {SPEED_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>

      <input
        type="range"
        min={0}
        max={Math.max(1, state.total)}
        value={state.revealed}
        onChange={(e) => controls.setRevealed(Number(e.target.value))}
        aria-label="Playback progress"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-purple-400"
      />

      <span className="tabular-nums text-[10px] text-neutral-400">
        {state.revealed}/{state.total} · {percent}%
      </span>

      <Button size="sm" variant="ghost" onClick={controls.exit} title="Exit Replay mode">
        Exit
      </Button>
    </div>
  );
}
