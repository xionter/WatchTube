"use strict";

const DEFAULT_SETTINGS = {
    showWatchLater: true,
    hideShorts: false
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const controls = {};
const stateLabels = {};
const status = document.getElementById("status");

for (const key of SETTING_KEYS) {
    controls[key] = document.getElementById(key);
    stateLabels[key] = document.getElementById(`${key}State`);
}

init().catch((error) => {
    status.textContent = `Не удалось загрузить настройки: ${error.message}`;
});

async function init() {
    assertUi();

    const settings = await readSettings();

    syncControls(settings);
    renderStatus(settings);

    controls.showWatchLater.addEventListener("change", handleToggleChange);
    controls.hideShorts.addEventListener("change", handleToggleChange);
}

function assertUi() {
    for (const key of SETTING_KEYS) {
        if (!controls[key] || !stateLabels[key]) {
            throw new Error("Popup control is missing");
        }
    }

    if (!status) {
        throw new Error("Popup status element is missing");
    }
}

async function readSettings() {
    const { watchTubeSettings } = await chrome.storage.local.get("watchTubeSettings");
    return {
        ...DEFAULT_SETTINGS,
        ...(watchTubeSettings || {})
    };
}

function syncControls(settings) {
    for (const key of SETTING_KEYS) {
        controls[key].checked = settings[key];
        stateLabels[key].textContent = settings[key] ? "Включено" : "Выключено";
    }
}

async function handleToggleChange() {
    const nextSettings = collectSettings();

    await chrome.storage.local.set({ watchTubeSettings: nextSettings });
    syncControls(nextSettings);
    renderStatus(nextSettings);
}

function collectSettings() {
    const settings = {};

    for (const key of SETTING_KEYS) {
        settings[key] = controls[key].checked;
    }

    return settings;
}

function renderStatus(settings) {
    const enabledFeatures = [];

    if (settings.showWatchLater) {
        enabledFeatures.push("Watch Later в первой строке");
    }
    if (settings.hideShorts) {
        enabledFeatures.push("скрытие Shorts");
    }
    status.textContent = enabledFeatures.length
        ? `Активно: ${enabledFeatures.join(", ")}. Изменения применяются автоматически на открытых вкладках YouTube.`
        : "Все дополнительные функции отключены. YouTube будет выглядеть почти как обычно.";
}
