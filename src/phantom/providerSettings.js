let pending;

/** Load optional local owner controls only after an explicit settings action. */
export async function openProviderSettings() {
  pending ??= import('../keySetup.js').then(({ initKeySetup }) =>
    initKeySetup(),
  );
  try {
    const settings = await pending;
    settings?.open();
    return Boolean(settings);
  } catch {
    pending = undefined;
    return false;
  }
}
