import * as settingsStore from "../content/core/settings.js";

const elements = {
  controls: {
    enabled: document.querySelector("#enabled"),
    hideShorts: document.querySelector("#hideShorts"),
  },

  states: {
    enabled: document.querySelector("#enabledState"),
    hideShorts: document.querySelector("#hideShortsState"),
  },
};

let currentSettings = null;

main().catch(handleError);

async function main() {
  assertUi();

  const settings = await settingsStore.readSettings();

  render(settings);

  for (const control of Object.values(elements.controls)) {
    control.addEventListener("change", handleSettingsChange);
  }
}

function assertUi() {
  const requiredElements = [
    ...Object.values(elements.controls),
    ...Object.values(elements.states),
  ];

  if (requiredElements.some((element) => !element)) {
    throw new Error("Required popup elements are missing");
  }
}

function render(settings) {
  currentSettings = settings;
  updateControls(settings);
}

function updateControls(settings) {
  for (const [key, control] of Object.entries(elements.controls)) {
    const enabled = settings[key];

    control.checked = enabled;

    elements.states[key].textContent = enabled ? "On" : "Off";
  }
}

async function handleSettingsChange() {
  const settings = await settingsStore.writeSettings({
    ...currentSettings,
    ...Object.fromEntries(
      Object.entries(elements.controls).map(([key, control]) => [
        key,
        control.checked,
      ]),
    ),
  });

  render(settings);
}

function handleError(error) {
  console.error(error);
}
