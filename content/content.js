(async () => {
    const runtime = globalThis.browser?.runtime || chrome.runtime;
    await import(
        runtime.getURL("content/main.js")
    );
})();
