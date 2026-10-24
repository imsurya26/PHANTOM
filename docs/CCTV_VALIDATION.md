# Public camera audit

Checked 17 October 2026. Camera availability changes; these checks are not a guarantee of continued service.

## Media evidence

| Source and camera | Evidence | Classification | Capture time |
| --- | --- | --- | --- |
| Fintraffic C0150301, Inkoo | Chrome decoded HTTPS JPEG, 1280 × 720 | Snapshot, not video | Not proven by the image decode |
| TfL JamCam 00002.00865, A406 Billet Underpass | Chrome decoded HTTPS JPEG, 352 × 288 | Snapshot | Unknown |
| Same TfL camera, MP4 | Chrome decoded and playback time advanced over two seconds; duration 11.08 seconds | Recorded video clip, **not live video** | Unknown |
| Vegvesen 1900098_1 | HTTPS master playlist returned 200 and application/vnd.apple.mpegurl | HLS candidate; actual playback not yet verified | Unknown |

Public URLs tested: https://weathercam.digitraffic.fi/C0150301.jpg; https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg; https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4; https://kamera.vegvesen.no/public/1900098_1/manifest.m3u8.

## Ownership and terms

These addresses come from the existing official catalogs, not camera discovery or private network scanning. Fintraffic requires attribution under [CC BY 4.0](https://www.digitraffic.fi/kayttoehdot/). TfL publishes JamCam images/clips as [open transport data](https://tfl.gov.uk/info-for/open-data-users/our-open-data); its transport data terms apply. The Norwegian Public Roads Administration [publishes webcam information](https://www.vegvesen.no/en/fag/technology/open-data/a-selection-of-open-data/what-is-datex/) and requires source credit; image update frequency varies and old images can persist during outages. No authentication bypass was used.

## Changes

Selecting a marker now shows metadata without fetching media. **Watch** starts media only for that selected camera. **Close viewer**, collapse, backgrounding, camera change, disabling the layer and application disposal release playback. HLS remains lazy-loaded and its existing bounded server lease is released. Nonselected thumbnail requests are suppressed. Generic media redirects now use the same bounded original-origin policy as images.

HTTP success is not playback proof. Finite clips are labelled recorded video. Live video requires decoded, advancing HLS playback with a nonfinite duration; capture time remains explicitly unknown. Snapshot retrieval time is never presented as capture time. Synthetic placeholders are unavailable and Street View fallbacks are historical/static. The summary text no longer starts a typing interval.

## Limits and remaining validation

The direct public-media checks prove decoding of two snapshots and one finite clip. They do not prove full PHANTOM marker-to-player interaction, HLS playback, mobile behavior, all providers, provider capture freshness, or every network failure scenario. Automated tests cover demand gating, teardown, classification, existing frame race handling, proxy body/timeout/range behavior and HLS leases. Full browser workflow validation must be recorded separately before calling the entire feature complete. DASH/WebRTC/embedded players are not added; no unknown camera is advertised as live. Existing billboard LOD is retained; this pass does not claim newly implemented marker clustering.


## PHANTOM workflow verification, 20 October 2026

`qa-artifacts/rescue/cctv-watch.json` records the running app at 1440 x 900 and 390 x 844. The real official catalog selected Fintraffic `fi-c1455101`, Rovaniemi Revontuli 5. Selection used the app layer API; Watch and Close used actual browser pointer clicks. Both sizes made zero camera media requests before Watch, decoded a 1280 x 720 snapshot after Watch, and cleared the image URL, active video reference, media plane and watching state after Close. There were two image requests per opening (panel and globe projection). No fixture media was injected.

This proves the selected-camera snapshot workflow at both sizes, not physical marker hit-testing or integrated HLS video. The earlier direct TfL clip check remains separate. The first attempt timed out waiting for a click; the successful rerun captured layout state and completed both viewport cases. The Watch control was subsequently given the existing scene-button style and a 44px touch target.
