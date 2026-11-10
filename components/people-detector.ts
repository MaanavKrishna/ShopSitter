// Finds hands and people in the camera picture, on this device. Nothing it looks at is
// stored or sent anywhere; it answers only "is a hand in view?" and "is a person in view?".

const VERSION = "1.2.2";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";

export type Sighting = { hand: boolean; person: boolean };
export type PeopleDetector = { look: (video: HTMLVideoElement, t: number) => Sighting; close: () => void };

/** Resolves to null when the device or network can't run the detector; the stand works without it. */
export async function loadPeopleDetector(): Promise<PeopleDetector | null> {
  try {
    const { FilesetResolver, HandLandmarker, ObjectDetector } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate: "GPU" | "CPU") => {
      const hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
      });
      const people = await ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${MODELS}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`, delegate },
        runningMode: "VIDEO",
        categoryAllowlist: ["person"],
        scoreThreshold: 0.5,
        maxResults: 3,
      });
      return { hands, people };
    };
    const { hands, people } = await make("GPU").catch(() => make("CPU"));
    return {
      look: (video, t) => ({
        hand: hands.detectForVideo(video, t).landmarks.length > 0,
        person: people.detectForVideo(video, t).detections.length > 0,
      }),
      close: () => {
        hands.close();
        people.close();
      },
    };
  } catch (e) {
    console.warn("people detector unavailable", e);
    return null;
  }
}
