import { StageProgressArea } from './StageProgressArea.js';

export function DefaultArea() {
  return (
    <div className="flex flex-col items-center">
      <StageProgressArea step={3} numSteps={4} state="error" message="Not yet implemented" />
    </div>
  );
}
