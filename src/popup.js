"use strict";

const DEFAULT_SETTINGS = {
    showWatchLater: true,
    hideShorts: false,
    hideCategories: false
};

const controls = {
    showWatchLater: document.getElementById("showWatchLater"),
    hideShorts: document.getElementById("hideShorts"),
    hideCategories: document.getElementById("hideCategories")
};

const stateLabels = {
    showWatchLater: document.getElementById("showWatchLaterState"),
    hideShorts: document.getElementById("hideShortsState"),
    hideCategories: document.getElementById("hideCategoriesState")
};

const status = document.getElementById("status");

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
    controls.hideCategories.addEventListener("change", handleToggleChange);
}

function assertUi() {
    for (const control of Object.values(controls)) {
        if (!control) {
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
    controls.showWatchLater.checked = settings.showWatchLater;
    controls.hideShorts.checked = settings.hideShorts;
    controls.hideCategories.checked = settings.hideCategories;

    stateLabels.showWatchLater.textContent = settings.showWatchLater ? "Включено" : "Выключено";
    stateLabels.hideShorts.textContent = settings.hideShorts ? "Включено" : "Выключено";
    stateLabels.hideCategories.textContent = settings.hideCategories ? "Включено" : "Выключено";
}

async function handleToggleChange() {
    const nextSettings = collectSettings();

    await chrome.storage.local.set({ watchTubeSettings: nextSettings });
    syncControls(nextSettings);
    renderStatus(nextSettings);
}

function collectSettings() {
    return {
        showWatchLater: controls.showWatchLater.checked,
        hideShorts: controls.hideShorts.checked,
        hideCategories: controls.hideCategories.checked
    };
}

function renderStatus(settings) {
    const enabledFeatures = [];

    if (settings.showWatchLater) {
        enabledFeatures.push("Watch Later на главной");
    }
    if (settings.hideShorts) {
        enabledFeatures.push("скрытие Shorts");
    }
    if (settings.hideCategories) {
        enabledFeatures.push("скрытие категорий");
    }

    status.textContent = enabledFeatures.length
        ? `Активно: ${enabledFeatures.join(", ")}. Изменения применяются автоматически на открытых вкладках YouTube.`
        : "Все дополнительные функции отключены. YouTube будет выглядеть почти как обычно.";
}
