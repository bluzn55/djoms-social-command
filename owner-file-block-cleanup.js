/* DOC JAKS · Owner dashboard legacy-file cleanup.
   The "OPEN FILE DIRECTLY" block was removed from mission-direction.js.
   This defensive guard removes the same retired element if a browser mixes
   cached dashboard assets during an update. It leaves the File Downloads
   summary row and the expandable verified evidence table untouched. */
(() => {
  'use strict';
  const strip = document.getElementById('connectionStrip');
  if (!strip) return;
  const removeRetiredBlocks = () => {
    strip.querySelectorAll('.mission-action-card-files').forEach(block => block.remove());
  };
  removeRetiredBlocks();
  new MutationObserver(removeRetiredBlocks).observe(strip, {childList: true, subtree: true});
})();
