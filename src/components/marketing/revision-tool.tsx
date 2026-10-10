'use client';
import { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';
export function RevisionTool() {
  const [name, setName] = useState('');
  const [included, setIncluded] = useState('2');
  const [used, setUsed] = useState('0');
  const [notice, setNotice] = useState('');
  const a = Number(included),
    b = Number(used);
  const valid =
    included !== '' &&
    used !== '' &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0 &&
    a <= 1000 &&
    b <= 1000;
  const remaining = a - b;
  const result = !valid
    ? 'Enter whole numbers from 0 to 1,000.'
    : remaining >= 0
      ? `${remaining} ${remaining === 1 ? 'round' : 'rounds'} remaining`
      : `${-remaining} extra ${remaining === -1 ? 'round' : 'rounds'}`;
  const summary = `${name.trim() || 'Client project'}\nIncluded revision rounds: ${a}\nUsed revision rounds: ${b}\n${result}\n\nConfirm the price and deadline for additional work before starting it.\nCreated with Clientlane's free revision tracker.`;
  function download() {
    const url = URL.createObjectURL(new Blob([summary], { type: 'text/plain;charset=utf-8' }));
    const el = document.createElement('a');
    el.href = url;
    el.download = 'revision-summary.txt';
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setNotice('Summary copied.');
    } catch {
      setNotice('Copy is unavailable in this browser. Download the summary instead.');
    }
  }
  return (
    <div className="m-tool">
      <div className="m-tool-fields">
        <label>
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="e.g. Acme website"
          />
        </label>
        <div className="m-tool-numbers">
          <label>
            Included revision rounds
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={included}
              onChange={(e) => setIncluded(e.target.value)}
            />
          </label>
          <label>
            Used revision rounds
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={used}
              onChange={(e) => setUsed(e.target.value)}
            />
          </label>
        </div>
        <p>
          One round usually means one consolidated set of feedback followed by one updated delivery.
          Agree on the definition with your client.
        </p>
      </div>
      <div className={`m-tool-result ${remaining < 0 ? 'extra' : ''}`}>
        <span className="m-eyebrow">YOUR REVISION ALLOWANCE</span>
        <h2 data-testid="revision-result" aria-live="polite">
          {result}
        </h2>
        <p>
          {remaining < 0
            ? 'Time to agree on the cost and timeline for additional work.'
            : 'Keep feedback together and record the next review decision.'}
        </p>
        <div className="m-actions">
          <button className="m-button" disabled={!valid} onClick={download}>
            <Download size={17} /> Download summary
          </button>
          <button className="m-tool-copy" disabled={!valid} onClick={() => void copy()}>
            <Copy size={17} /> Copy
          </button>
        </div>
        <p role="status" className="m-tool-notice">
          {notice && (
            <>
              <Check size={15} />
              {notice}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
