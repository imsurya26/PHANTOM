import { startApplicationChrome } from '../app/startupChrome.js';
import { mountPhantomShell } from '../phantom/shell.js';
import { mountUniversalSearch } from '../phantom/universalSearch.js';
import { mountPerformanceDiagnostics } from '../phantom/diagnostics.js';
export function startStandaloneChrome(options) {
  const stopShell = mountPhantomShell(options);
  const stopSearch = mountUniversalSearch(options);
  const stopDiagnostics = mountPerformanceDiagnostics(options);
  const stopChrome = startApplicationChrome({
    ...options,
    initializeWelcome: () => {
      window.dispatchEvent(new Event('phantom:welcome'));
      return { destroy() {} };
    },
  });
  return async () => {
    stopSearch();
    stopDiagnostics();
    stopShell();
    await stopChrome();
  };
}
