export function shuffle(arr) {
    for (let index = arr.length - 1; index > 0; index -= 1) {
        const nextIndex = Math.floor(Math.random() * (index + 1));

        [arr[index], arr[nextIndex]] = [
            arr[nextIndex],
            arr[index],
        ];
    }
    return arr;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function getValue(source, path, fallback) {
    let value = source;
    for (const part of path) {
        if (value == null || value[part] == null) {
            return fallback;
        }
        value = value[part];
    }
    return value;
}

export function normalizeYouTubeUrl(path) {
    if (!path) {
        return "";
    }
    if (path.startsWith("http")) {
        return path;
    }
    return `https://www.youtube.com${path}`;
}

export function getVideoId(url) {
    try {
        return new URL(url).searchParams.get("v");
    } catch {
        return "";
    }
}
