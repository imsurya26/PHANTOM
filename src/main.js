import { createStandaloneApplication } from './standalone/application.js';

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch(() => {
  // Provider exceptions may contain request URLs or credentials. Do not render
  // or log arbitrary startup error objects in the public document.
  console.error('PHANTOM initialization failed.');
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  if (loaderStatus) {
    loaderStatus.textContent =
      'The explorer could not start. Reload the page to try again.';
    loaderStatus.setAttribute('role', 'alert');
  }
});

export { application };
