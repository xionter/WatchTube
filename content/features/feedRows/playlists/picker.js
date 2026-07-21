import { buildPlaylistPickerModel } from "./pickerModel.js";

export function renderPlaylistPicker({
  availablePlaylists,
  settings,
  query,
  pickerList,
  pickerStatus,
  onAddPlaylist,
  onTogglePlaylist,
  onToggleSubscriptions,
}) {
  const model = buildPlaylistPickerModel({
    availablePlaylists,
    settings,
    query,
  });

  pickerList.replaceChildren();

  for (const item of model.items) {
    pickerList.append(
      item.type === "subscriptions"
        ? createSubscriptionPickerButton({
            item,
            onToggleSubscriptions,
          })
        : createPlaylistPickerButton({
            item,
            onAddPlaylist,
            onTogglePlaylist,
          }),
    );
  }

  if (model.items.length) {
    pickerStatus.hidden = true;

    return;
  }

  pickerStatus.hidden = false;
  pickerStatus.textContent = model.emptyText;
}

function createSubscriptionPickerButton({ item, onToggleSubscriptions }) {
  const button = createPickerButton(item);

  button.addEventListener("click", async () => {
    await onToggleSubscriptions?.({
      enabled: !item.enabled,
    });
  });

  return button;
}

function createPlaylistPickerButton({ item, onAddPlaylist, onTogglePlaylist }) {
  const button = createPickerButton(item);

  button.addEventListener("click", async () => {
    if (item.isStored) {
      await onTogglePlaylist?.({
        playlistId: item.playlistId,
        enabled: !item.isEnabled,
      });

      return;
    }

    await onAddPlaylist?.({
      playlistId: item.playlistId,
      title: item.title,
    });
  });

  return button;
}

function createPickerButton(item) {
  const button = document.createElement("button");
  const title = document.createElement("span");
  const state = document.createElement("span");

  button.className = "watchtube-playlist-picker-item";
  button.type = "button";
  button.dataset.state = item.state;

  title.className = "watchtube-playlist-picker-title";
  title.textContent = item.title;

  state.className = "watchtube-playlist-picker-state";
  state.textContent = item.stateText;

  button.append(title, state);

  return button;
}
