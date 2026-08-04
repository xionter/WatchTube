import { describe, expect, it } from "vitest";

import {
  extractInnertubeApiKey,
  extractInnertubeContext,
  extractYtConfig,
  findContinuationVideos,
  findPlaylistContinuation,
  findPlaylistVideos,
} from "./parser.js";

function playlistVideo(videoId) {
  return {
    playlistVideoRenderer: {
      videoId,
      title: {
        runs: [
          {
            text: `Video ${videoId}`,
          },
        ],
      },
    },
  };
}

function continuationItem(token) {
  return {
    continuationItemRenderer: {
      continuationEndpoint: {
        continuationCommand: {
          token,
        },
      },
    },
  };
}

function initialPlaylistJson(contents) {
  return {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              selected: true,
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            playlistVideoListRenderer: {
                              contents,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}

describe("playlist parser continuations", () => {
  it("finds initial playlist videos and continuation token", () => {
    const json = initialPlaylistJson([
      playlistVideo("a"),
      playlistVideo("b"),
      continuationItem("NEXT"),
    ]);

    expect(findPlaylistVideos(json)).toHaveLength(2);
    expect(findPlaylistContinuation(json)).toBe("NEXT");
  });

  it("finds videos from continuation response items", () => {
    const json = {
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [playlistVideo("c"), continuationItem("MORE")],
          },
        },
      ],
    };

    expect(
      findContinuationVideos(json).map(
        (item) => item.playlistVideoRenderer?.videoId,
      ),
    ).toEqual(["c"]);
    expect(findPlaylistContinuation(json)).toBe("MORE");
  });

  it("finds videos from playlist continuation contents", () => {
    const json = {
      continuationContents: {
        playlistVideoListContinuation: {
          contents: [playlistVideo("d"), playlistVideo("e")],
          continuations: [
            {
              nextContinuationData: {
                continuation: "AFTER_CONTENTS",
              },
            },
          ],
        },
      },
    };

    expect(
      findContinuationVideos(json).map(
        (item) => item.playlistVideoRenderer?.videoId,
      ),
    ).toEqual(["d", "e"]);
    expect(findPlaylistContinuation(json)).toBe("AFTER_CONTENTS");
  });

  it("extracts Innertube config from ytcfg html", () => {
    const html = `
      <script>
        ytcfg.set({
          "INNERTUBE_API_KEY": "API_KEY",
          "INNERTUBE_CONTEXT": {
            "client": {
              "clientName": "WEB",
              "clientVersion": "1.2.3"
            }
          }
        });
      </script>
    `;
    const config = extractYtConfig(html);

    expect(extractInnertubeApiKey(config)).toBe("API_KEY");
    expect(extractInnertubeContext(config)).toEqual({
      client: {
        clientName: "WEB",
        clientVersion: "1.2.3",
      },
    });
  });
});
